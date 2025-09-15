import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { venueModel } from "src/models/venue/venue-schema";
import { httpStatusCode, VENUE_TIME_SLOTS } from "src/lib/constant";
import { bookingModel } from "src/models/venue/booking-schema";
import { usersModel } from "src/models/user/user-schema";
import mongoose from "mongoose";
import { courtModel } from "src/models/venue/court-schema";
import { getCurrentISTTime, isDateTodayInIST } from "../../utils";
// import { priceModel } from "src/models/admin/price-schema";
import { adminSettingModel } from "src/models/admin/admin-settings";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { friendsModel } from "src/models/user/friends-schema";
import { end } from "pdfkit";
import { user } from "src/routes";
import { dynamicPrizeModel } from "src/models/admin/dynamic-prize-schema";

export const userHomeServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const {
    nearBy = true,
    lng: lngQuery = null,
    lat: latQuery = null,
  } = req.query;

  // const lng = lngQuery ? Number(lngQuery) : null;
  // const lat = latQuery ? Number(latQuery) : null;
  const lng = null;
  const lat = null;

  const currentDate = new Date().toISOString();

  // Build geo query pipeline
  const geoPipeline: mongoose.PipelineStage[] =
    lng && lat
      ? [
          {
            $geoNear: {
              near: { type: "Point", coordinates: [lng, lat] },
              distanceField: "distance",
              spherical: true,
              maxDistance: 20000, // 20km max distance
              query: { isActive: true },
            },
          },
          {
            $limit: 20,
          },
          {
            $project: {
              name: 1,
              city: 1,
              state: 1,
              image: 1,
              location: 1,
              weather: 1,
              distance: { $round: [{ $divide: ["$distance", 1000] }, 1] }, // Convert to km
            },
          },
        ]
      : [];

  // Match bookings for user (team1 or team2) that are upcoming and not cancelled
  const matchQuery = {
    $or: [
      {
        team1: {
          $elemMatch: {
            playerId: new mongoose.Types.ObjectId(userData.id),
            paymentStatus: "Paid",
          },
        },
      },
      {
        team2: {
          $elemMatch: {
            playerId: new mongoose.Types.ObjectId(userData.id),
            paymentStatus: "Paid",
          },
        },
      },
    ],
    bookingDate: { $gte: currentDate },
    bookingType: { $ne: "Cancelled" },
  };

  // Fetch data in parallel
  const nearbyVenuesPromise =
    // lng && lat
    //   ? venueModel.aggregate(geoPipeline)
    //   :
    venueModel
      .find({ isActive: true })
      .select("name city state image weather location")
      .lean();

  const [nearbyVenues, allMatches, banners, userLoyalty] = await Promise.all([
    nearbyVenuesPromise,
    bookingModel.find(matchQuery).lean(),
    adminSettingModel
      .findOne({ isActive: true })
      .select("banners loyaltyPoints")
      .lean(),
    additionalUserInfoModel.findOne({ userId: userData.id }).lean(),
  ]);

  const perMatch = banners?.loyaltyPoints?.perMatch || 200;
  const limit = banners?.loyaltyPoints?.limit || 2000;

  const level = (userLoyalty?.loyaltyPoints || 0) / perMatch;
  const totalLevel = limit / perMatch;

  const clubResponse = await usersModel
    .findById(userData.id)
    .select("clubResponse")
    .lean();

  const padelResponse = {
    games:
      (userLoyalty?.padelLoyalty || 0) /
      (banners?.loyaltyPoints?.perMatch || 200),
    gamesLeft:
      (banners?.loyaltyPoints?.limit || 2000) /
        (banners?.loyaltyPoints?.perMatch || 200) -
      (userLoyalty?.padelLoyalty || 0) /
        (banners?.loyaltyPoints?.perMatch || 200),
    plancoinEarned: userLoyalty?.earnedPadel || 0,
    totalLevels: totalLevel,
  };
  const pickleballResponse = {
    games:
      (userLoyalty?.pickleballLoyalty || 0) /
      (banners?.loyaltyPoints?.perMatch || 200),
    gamesLeft:
      (banners?.loyaltyPoints?.limit || 2000) /
        (banners?.loyaltyPoints?.perMatch || 200) -
      (userLoyalty?.pickleballLoyalty || 0) /
        (banners?.loyaltyPoints?.perMatch || 200),
    plancoinEarned: userLoyalty?.earnedPickleball || 0,
    totalLevels: totalLevel,
  };
  const data = {
    banners: banners?.banners || [],
    upcomingMatches: allMatches,
    venueNearby: nearbyVenues,
    playersRanking: [], // Can be fetched in parallel too if added later
    clubResponse: clubResponse?.clubResponse ? true : false,
    padelResponse,
    pickleballResponse,
  };

  return {
    success: true,
    message: "User home data retrieved successfully",
    data,
  };
};

export const clubResponseServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { status, clubName = "Chandigarh Club", clubId } = req.body;

  if (!status) {
    await usersModel.findByIdAndUpdate(userData.id, {
      clubResponse: true,
    });
    return {
      success: true,
      message: "Club status updated successfully",
    };
  } else {
    if (!clubId) {
      return errorResponseHandler(
        "Club ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    await usersModel.findByIdAndUpdate(userData.id, {
      clubId,
      clubName,
      clubResponse: true,
    });

    return {
      success: true,
      message: "Club status updated successfully",
    };
  }
};

export const getVenuesServices = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const {
      date = new Date().toISOString(),
      distance = "ASC",
      game = "all",
      lng,
      lat,
    } = req.query;

    const lngNum = Number(lng);
    const latNum = Number(lat);
    const requestDate = new Date(date as string);
    requestDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);

    const istTime = getCurrentISTTime();
    const isRequestedDateToday = isDateTodayInIST(requestDate);
    const currentHour = istTime.getHours();

    // Build geo query
    const geoQuery: any = { isActive: true };
    if (game !== "all") geoQuery.gamesAvailable = { $in: [game] };

    const MAX_SEARCH_DISTANCE = 100000; // 100 km
    const venues = await venueModel.aggregate([
      // {
      //   $geoNear: {
      //     near: { type: "Point", coordinates: [lngNum, latNum] },
      //     distanceField: "distance",
      //     spherical: true,
      //     maxDistance: MAX_SEARCH_DISTANCE,
      //     query: geoQuery,
      //   },
      // },
      {
        $project: {
          _id: 1,
          name: 1,
          address: 1,
          city: 1,
          state: 1,
          image: 1,
          gamesAvailable: 1,
          timeslots: 1,
          weather: 1,
          location: 1,
          distance: { $round: [{ $divide: ["$distance", 1000] }, 1] },
        },
      },
      // { $sort: { distance: distance === "ASC" ? 1 : -1 } },
    ]);

    if (venues.length === 0) {
      return {
        success: true,
        message: "No venues found",
        data: [],
      };
    }

    const venueIds = venues.map((v) => v._id);

    // Prepare court query
    const courtsQuery: any = {
      venueId: { $in: venueIds },
      isActive: true,
    };
    if (game !== "all") courtsQuery.games = game;

    // Parallel fetch: courts and bookings
    const [courts, bookings] = await Promise.all([
      courtModel
        .find(courtsQuery)
        .select("_id name venueId games hourlyRate image")
        .lean(),
      bookingModel
        .find({
          venueId: { $in: venueIds },
          bookingDate: { $gte: requestDate, $lte: endOfDay },
        })
        .lean(),
    ]);

    // Group courts by venue
    const courtsByVenue: Record<string, any[]> = {};
    courts.forEach((court) => {
      const venueId = court.venueId.toString();
      if (!courtsByVenue[venueId]) courtsByVenue[venueId] = [];
      courtsByVenue[venueId].push(court);
    });

    // Map of booked slots
    const bookedSlots: Record<string, Record<string, string[]>> = {};
    bookings.forEach((booking: any) => {
      const venueId = booking.venueId.toString();
      const courtId = booking.courtId.toString();

      if (!bookedSlots[venueId]) bookedSlots[venueId] = {};
      if (!bookedSlots[venueId][courtId]) bookedSlots[venueId][courtId] = [];

      if (Array.isArray(booking.bookingSlots)) {
        bookedSlots[venueId][courtId].push(...booking.bookingSlots);
      } else {
        bookedSlots[venueId][courtId].push(booking.bookingSlots);
      }
    });

    // Prepare response
    const dateString = requestDate.toLocaleDateString("en-CA");
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(requestDate);

    const result = venues.map((venue: any) => {
      const venueId = venue._id.toString();
      const venueCourts = courtsByVenue[venueId] || [];
      const venueTimeslots = venue.timeslots || VENUE_TIME_SLOTS;

      const courtsWithAvailability = venueCourts.map((court: any) => {
        const courtId = court._id.toString();
        const booked = bookedSlots[venueId]?.[courtId] || [];

        // const availableSlots = venueTimeslots.filter((slot: string) => {
        //   if (booked.includes(slot)) return false;
        //   if (isRequestedDateToday) {
        //     const slotHour = parseInt(slot.split(":")[0], 10);
        //     if (slotHour <= currentHour) return false;
        //   }
        //   return true;
        // });

        return { ...court, availableSlots: [] };
      });

      return {
        _id: venue._id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        image: venue.image,
        gamesAvailable: venue.gamesAvailable,
        facilities: venue.facilities,
        weather: venue.weather,
        venueInfo: venue.venueInfo,
        distance: venue.distance,
        location: venue.location,
        date: dateString,
        formattedDate: formattedDate,
        courts: courtsWithAvailability,
        hasFilteredCourts: courtsWithAvailability.length > 0,
      };
    });

    return {
      success: true,
      message: "Venues retrieved successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in getVenuesServices:", error);
    return errorResponseHandler(
      "Error retrieving venues: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const getCourtsServices = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const { venueId, date, game } = req.query;

    if (!venueId) {
      return errorResponseHandler(
        "Venue ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Step 1: Fetch venue
    const venueData = await venueModel
      .findById(venueId)
      .select("-employees")
      .lean();

    if (!venueData) {
      return errorResponseHandler(
        "Venue not found",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Step 2: Fetch courts
    const courtsQuery: any = {
      venueId: venueId,
      isActive: true,
    };

    if (game && game !== "all") {
      courtsQuery.games = game;
    }

    const courts = await courtModel
      .find(courtsQuery)
      .select("_id name venueId games hourlyRate image")
      .lean();

    // Step 3: If no date provided, return early
    if (!date) {
      return {
        success: true,
        message: "Courts retrieved successfully",
        data: {
          ...venueData,
          courts,
        },
      };
    }

    // Step 4: Date-specific processing
    const requestDate = new Date(date as string);
    requestDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);

    const istTime = getCurrentISTTime();
    const isRequestedDateToday = isDateTodayInIST(requestDate);
    const currentHour = istTime.getHours();

    const dayOfWeek = requestDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayType = isWeekend ? "weekend" : "weekday";

    const indiaToday = `${date}T00:00:00.000+00:00`;

    // Fetch pricing and bookings in parallel
    const [pricing, allBookings] = await Promise.all([
      dynamicPrizeModel.find({ date: indiaToday }).lean(),
      bookingModel
        .find({
          venueId,
          bookingType: { $ne: "Cancelled" },
          bookingDate: { $gte: requestDate, $lte: endOfDay },
        })
        .lean(),
    ]);

    const confirmedSlots: Record<string, string[]> = {};
    const pendingSlots: Record<string, string[]> = {};

    for (const booking of allBookings) {
      const courtId = booking.courtId?.toString?.() ?? String(booking.courtId);
      const target = booking.bookingPaymentStatus
        ? confirmedSlots
        : pendingSlots;

      if (!target[courtId]) {
        target[courtId] = [];
      }

      const slots = Array.isArray(booking.bookingSlots)
        ? booking.bookingSlots
        : [booking.bookingSlots];

      target[courtId].push(...slots);
    }

    const dateString = requestDate.toLocaleDateString("en-CA");
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(requestDate);

    const courtsWithAvailability = courts.map((court) => {
      const courtId = court._id.toString();
      const confirmed = confirmedSlots[courtId] || [];
      const venueTimeslots = venueData.timeslots || VENUE_TIME_SLOTS;
      const baseRate = court.hourlyRate || 1200;

      const availableSlots = venueTimeslots.map((slot: string) => {
        const slotHour = parseInt(slot.split(":")[0], 10);
        const isPast = isRequestedDateToday && slotHour <= currentHour;
        const isBooked = confirmed.includes(slot);
        const isAvailable = !isBooked && !isPast;

        let price = baseRate;
        let isDiscounted = false;
        let isPremium = false;

        const courtSlots = pricing.find((p) => String(p.courtId) === courtId);

        if (courtSlots) {
          const match = courtSlots?.slotPricing?.find(
            (s: any) => s.slot === slot
          );
          price = match?.price || baseRate;
          isDiscounted = price < baseRate;
          isPremium = price > baseRate;
        } else {
          price = baseRate;
          isDiscounted = price < baseRate;
          isPremium = price > baseRate;
        }

        return {
          time: slot,
          price,
          isDiscounted,
          isPremium,
          isAvailable,
          isConfirmedBooked: isBooked,
          isPastSlot: isPast,
        };
      });

      return {
        ...court,
        availableSlots,
      };
    });

    return {
      success: true,
      message: "Courts retrieved successfully",
      data: {
        ...venueData,
        courts: courtsWithAvailability,
        date: dateString,
        formattedDate,
        dayType,
      },
    };
  } catch (error) {
    console.error("Error in getCourtsServices:", error);
    return errorResponseHandler(
      "Error retrieving courts: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const createGuestServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { fullName } = req.body;
  const firstName = fullName.split(" ")[0];
  const lastName = fullName.split(" ")[1] || "";

  const guestData = await usersModel.create({
    fullName,
    firstName,
    lastName,
    role: "guest",
  });

  await friendsModel.create({
    userId: userData.id,
    friendId: guestData._id,
    status: "accepted",
  });

  return {
    success: true,
    message: "Guest created successfully",
    data: guestData,
  };
};

// export const getOpenMatchesServices = async (req: Request, res: Response) => {
//   const userData = req.user as any;
//   const { date, distance = "ASC", game = "all", lng, lat } = req.query;

//   if (!lng || !lat) {
//     return errorResponseHandler(
//       "Location coordinates (lng, lat) are required",
//       httpStatusCode.BAD_REQUEST,
//       res
//     );
//   }

//   // Convert coordinates to numbers
//   const lngNum = Number(lng);
//   const latNum = Number(lat);

//   // Get current time in IST
//   const istTime = getCurrentISTTime();

//   // Create date query based on whether date is provided
//   let dateQuery: any;
//   let requestDate: Date;
//   let endOfDay: Date;
//   let isRequestedDateToday: boolean;

//   if (date) {
//     // If date is provided, get matches for that specific date
//     requestDate = new Date(date as string);
//     requestDate.setHours(0, 0, 0, 0); // Set to beginning of day

//     endOfDay = new Date(requestDate);
//     endOfDay.setHours(23, 59, 59, 999);

//     dateQuery = {
//       $gte: requestDate,
//       $lte: endOfDay,
//     };

//     isRequestedDateToday = isDateTodayInIST(requestDate);
//   } else {
//     // If no date provided, get all matches from today onwards
//     requestDate = new Date(istTime);
//     requestDate.setHours(0, 0, 0, 0); // Set to beginning of today

//     dateQuery = {
//       $gte: requestDate,
//     };

//     isRequestedDateToday = true; // Today's matches will be included
//   }

//   // Get current hour in IST
//   const currentHour = istTime.getHours();

//   console.log(
//     `Current IST time: ${istTime.toISOString()}, Hour: ${currentHour}`
//   );
//   console.log(`Is requested date today in IST: ${isRequestedDateToday}`);
//   console.log(`Date query: ${JSON.stringify(dateQuery)}`);

//   try {
//     // Create a MongoDB ObjectId from the user's ID
//     const userObjectId = new mongoose.Types.ObjectId(userData.id);

//     // Get bookings with askToJoin = true and matching the date query
//     // Exclude bookings where the user is already a participant
//     const bookings = await bookingModel
//       .find({
//         askToJoin: true,
//         bookingDate: dateQuery,
//         // Exclude bookings where user is already in team1 or team2
//         $and: [
//           {
//             "team1.playerId": { $ne: userObjectId },
//           },
//           {
//             "team2.playerId": { $ne: userObjectId },
//           },
//         ],
//       })
//       .lean();

//     console.log(
//       `Found ${bookings.length} open bookings with the date query (excluding user's own bookings)`
//     );

//     if (bookings.length === 0) {
//       return {
//         success: true,
//         message: "No open matches found",
//         data: [],
//         meta: {
//           date: date
//             ? new Date(date as string).toLocaleDateString("en-CA")
//             : "all",
//           isSpecificDate: !!date,
//           isToday: isRequestedDateToday,
//         },
//       };
//     }

//     // Get all venue IDs from the bookings
//     const venueIds = [...new Set(bookings.map((booking) => booking.venueId))];

//     // Get all court IDs from the bookings
//     const courtIds = [...new Set(bookings.map((booking) => booking.courtId))];

//     // Get venues data
//     const venues = await venueModel
//       .find({
//         _id: { $in: venueIds },
//         isActive: true,
//       })
//       .select("_id name city state address image weather location")
//       .lean();

//     console.log(`Found ${venues.length} venues for open matches`);

//     // Create a map of venues by ID for quick lookup
//     const venuesMap = venues.reduce((map, venue) => {
//       map[venue._id.toString()] = venue;
//       return map;
//     }, {} as Record<string, any>);

//     // Get courts data with game filtering if needed
//     let courtsQuery: any = {
//       _id: { $in: courtIds },
//       isActive: true,
//     };

//     if (game !== "all") {
//       courtsQuery.games = game;
//     }

//     const courts = await courtModel
//       .find(courtsQuery)
//       .select("_id name venueId games hourlyRate image")
//       .lean();

//     console.log(
//       `Found ${courts.length} courts for open matches with game filter: ${game}`
//     );

//     // Create a map of courts by ID for quick lookup
//     const courtsMap = courts.reduce((map, court) => {
//       map[court._id.toString()] = court;
//       return map;
//     }, {} as Record<string, any>);

//     // Get all user IDs from team1 and team2
//     const userIds = new Set<string>();
//     bookings.forEach((booking) => {
//       booking.team1?.forEach((player: any) => {
//         if (player.playerId) userIds.add(player.playerId.toString());
//       });
//       booking.team2?.forEach((player: any) => {
//         if (player.playerId) userIds.add(player.playerId.toString());
//       });
//     });

//     // Get user data
//     const users = await usersModel
//       .find({
//         _id: { $in: Array.from(userIds) },
//       })
//       .select("_id fullName profilePic")
//       .lean();

//     // Create a map of users by ID for quick lookup
//     const usersMap = users.reduce((map, user) => {
//       map[user._id.toString()] = {
//         _id: user._id,
//         name: user.fullName,
//         image: user.profilePic,
//       };
//       return map;
//     }, {} as Record<string, any>);

//     // Process bookings to include venue, court, and player data
//     const processedBookings = bookings
//       .filter((booking) => {
//         // Filter out bookings where the court doesn't match the game filter
//         const courtId = booking.courtId.toString();
//         if (!courtsMap[courtId]) return false;

//         // Check if this booking is for today
//         const bookingDate = new Date(booking.bookingDate);
//         const isBookingToday = isDateTodayInIST(bookingDate);

//         // For today's bookings, filter out those with slots that have already passed
//         if (isBookingToday) {
//           // Handle both array and string cases for bookingSlots
//           const bookingSlotsArray = Array.isArray(booking.bookingSlots)
//             ? booking.bookingSlots
//             : [booking.bookingSlots];

//           // Check if all booking slots have passed
//           const allSlotsPassed = bookingSlotsArray.every((slot: string) => {
//             const slotHour = parseInt(slot.split(":")[0], 10);
//             return slotHour <= currentHour;
//           });

//           // Skip this booking if all slots have passed
//           if (allSlotsPassed) {
//             console.log(
//               `Filtering out booking ${booking._id} as all slots have passed`
//             );
//             return false;
//           }
//         }

//         return true;
//       })
//       .map((booking) => {
//         const venueId = booking.venueId.toString();
//         const courtId = booking.courtId.toString();
//         const venue = venuesMap[venueId];
//         const court = courtsMap[courtId];

//         // Skip if venue or court not found (should not happen after filtering)
//         if (!venue || !court) return null;

//         // Calculate distance if venue has location
//         let distance = null;
//         if (venue.location?.coordinates?.length === 2) {
//           const [venueLng, venueLat] = venue.location.coordinates;
//           // Haversine formula for distance calculation
//           const R = 6371; // Earth radius in km
//           const dLat = ((venueLat - latNum) * Math.PI) / 180;
//           const dLon = ((venueLng - lngNum) * Math.PI) / 180;
//           const a =
//             Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//             Math.cos((latNum * Math.PI) / 180) *
//               Math.cos((venueLat * Math.PI) / 180) *
//               Math.sin(dLon / 2) *
//               Math.sin(dLon / 2);
//           const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//           distance = R * c;

//           // Limit to reasonable distance (15000 km)
//           if (distance > 15000) {
//             return null; // Skip venues that are too far away
//           }
//         }

//         // Check if this booking is for today
//         const bookingDate = new Date(booking.bookingDate);
//         const isBookingToday = isDateTodayInIST(bookingDate);

//         // For today's bookings, filter out slots that have already passed
//         let filteredBookingSlots: string[] = Array.isArray(booking.bookingSlots)
//           ? booking.bookingSlots
//           : [booking.bookingSlots];

//         if (isBookingToday) {
//           filteredBookingSlots = filteredBookingSlots.filter((slot: string) => {
//             const slotHour = parseInt(slot.split(":")[0], 10);
//             return slotHour > currentHour;
//           });
//         }

//         // Process team1 players
//         const team1 = (booking.team1 || []).map((player: any) => {
//           const playerId = player.playerId?.toString();
//           return {
//             playerType: player.playerType,
//             player: playerId ? usersMap[playerId] : null,
//           };
//         });

//         // Process team2 players
//         const team2 = (booking.team2 || []).map((player: any) => {
//           const playerId = player.playerId?.toString();
//           return {
//             playerType: player.playerType,
//             player: playerId ? usersMap[playerId] : null,
//           };
//         });

//         // Format the booking date
//         const bookingDateString = bookingDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
//         const formattedBookingDate = new Intl.DateTimeFormat("en-US", {
//           weekday: "long",
//           year: "numeric",
//           month: "long",
//           day: "numeric",
//         }).format(bookingDate);

//         return {
//           _id: booking._id,
//           bookingDate: booking.bookingDate,
//           formattedDate: formattedBookingDate,
//           bookingSlots: filteredBookingSlots,
//           askToJoin: booking.askToJoin,
//           isCompetitive: booking.isCompetitive,
//           skillRequired: booking.skillRequired,
//           team1,
//           team2,
//           venue: {
//             _id: venue._id,
//             name: venue.name,
//             city: venue.city,
//             state: venue.state,
//             address: venue.address,
//             image: venue.image,
//             weather: venue.weather,
//           },
//           court,
//           distance: distance !== null ? Math.round(distance * 10) / 10 : null,
//         };
//       })
//       .filter((booking) => booking !== null) as any[];

//     // Sort by date first (ascending), then by distance
//     processedBookings.sort((a, b) => {
//       // First sort by date
//       const dateA = new Date(a.bookingDate);
//       const dateB = new Date(b.bookingDate);

//       if (dateA.getTime() !== dateB.getTime()) {
//         return dateA.getTime() - dateB.getTime();
//       }

//       // If same date, sort by distance
//       // Handle null distances (put them at the end)
//       if (a.distance === null && b.distance === null) return 0;
//       if (a.distance === null) return 1;
//       if (b.distance === null) return -1;

//       // Sort by distance
//       return distance === "ASC"
//         ? a.distance - b.distance
//         : b.distance - a.distance;
//     });

//     console.log(`Returning ${processedBookings.length} processed open matches`);

//     // Prepare meta information
//     const meta = {
//       totalMatches: processedBookings.length,
//       isSpecificDate: !!date,
//       date: date ? new Date(date as string).toLocaleDateString("en-CA") : "all",
//       isToday: isRequestedDateToday,
//     };

//     return {
//       success: true,
//       message: "Open matches retrieved successfully",
//       data: processedBookings,
//       meta,
//     };
//   } catch (error) {
//     console.error("Error in getOpenMatchesServices:", error);
//     return errorResponseHandler(
//       "Error retrieving open matches: " + (error as Error).message,
//       httpStatusCode.INTERNAL_SERVER_ERROR,
//       res
//     );
//   }
// };

export const getOpenMatchesServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { date, game = "all", page = 1, limit = 10 } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  let startOfDay = new Date().toISOString() as any;
  let endOfDay = new Date(
    new Date().setHours(23, 59, 59, 999)
  ).toISOString() as any;

  if (date) {
    startOfDay = new Date(date as string);
    startOfDay.setUTCHours(0, 0, 0, 0);
    endOfDay = new Date(date as string);
    endOfDay.setUTCHours(23, 59, 59, 999);
    startOfDay = startOfDay.toISOString();
    endOfDay = endOfDay.toISOString();
  }

  const isToday =
    startOfDay.split("T")[0] === new Date().toISOString().split("T")[0];

  let dateQuery: any = {};
  if (date) {
    dateQuery = {
      $gt: isToday ? new Date().toISOString() : startOfDay,
      $lte: endOfDay,
    };
  } else {
    dateQuery = {
      $gt: isToday ? new Date().toISOString() : startOfDay,
    };
  }

  const userObjectId = new mongoose.Types.ObjectId(userData.id);

  // Count total matches (before pagination)
  const totalMatches = await bookingModel.countDocuments({
    askToJoin: true,
    bookingDate: dateQuery,
    bookingType: { $ne: "Cancelled" },
    $nor: [
      { "team1.playerId": userObjectId },
      { "team2.playerId": userObjectId },
    ],
  });

  // 1. Fetch bookings with pagination
  const bookings = await bookingModel
    .find({
      askToJoin: true,
      bookingDate: dateQuery,
      bookingType: { $ne: "Cancelled" },
      $nor: [
        { "team1.playerId": userObjectId },
        { "team2.playerId": userObjectId },
      ],
    })
    .sort({ bookingDate: 1 })
    .skip(skip)
    .limit(limitNumber)
    .lean();

  if (!bookings.length) {
    return {
      success: true,
      message: "No open matches found",
      data: [],
      meta: {
        totalMatches: 0,
        date: startOfDay,
        isSpecificDate: !!date,
        isToday: true,
        currentPage: pageNumber,
        totalPages: 0,
      },
    };
  }

  const venueIds = [...new Set(bookings.map((b) => b.venueId.toString()))];
  const courtIds = [...new Set(bookings.map((b) => b.courtId.toString()))];

  const [venues, courts, users] = await Promise.all([
    venueModel
      .find({ _id: { $in: venueIds }, isActive: true })
      .select("_id name city state address image weather location")
      .lean(),
    courtModel
      .find({
        _id: { $in: courtIds },
        isActive: true,
        ...(game !== "all" && { games: game }),
      })
      .select("_id name venueId games hourlyRate image")
      .lean(),
    usersModel
      .find({
        _id: {
          $in: Array.from(
            bookings.flatMap((b) => [
              ...b.team1.map((p: any) => p.playerId),
              ...b.team2.map((p: any) => p.playerId),
            ])
          ),
        },
      })
      .select("_id fullName profilePic")
      .lean(),
  ]);

  const venuesMap = new Map(venues.map((v) => [v._id.toString(), v]));
  const courtsMap = new Map(courts.map((c) => [c._id.toString(), c]));
  const usersMap = new Map(
    users.map((u) => [
      u._id.toString(),
      { _id: u._id, name: u.fullName, image: u.profilePic },
    ])
  );

  const processedBookings = bookings
    .map((booking) => {
      const venue = venuesMap.get(booking.venueId.toString());
      const court = courtsMap.get(booking.courtId.toString());
      if (!venue || !court) return null;

      const formatTeam = (team: any[]) =>
        team.map((player) => ({
          playerType: player.playerType,
          player:
            player.playerId && usersMap.has(player.playerId.toString())
              ? usersMap.get(player.playerId.toString())
              : null,
        }));

      const bookingDate = new Date(booking.bookingDate);
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(bookingDate);

      return {
        _id: booking._id,
        bookingDate,
        formattedDate,
        bookingSlots: booking.bookingSlots,
        askToJoin: booking.askToJoin,
        isCompetitive: booking.isCompetitive,
        skillRequired: booking.skillRequired,
        team1: formatTeam(booking.team1),
        team2: formatTeam(booking.team2),
        venue: {
          _id: venue._id,
          name: venue.name,
          city: venue.city,
          state: venue.state,
          address: venue.address,
          image: venue.image,
          weather: venue.weather,
        },
        court,
        distance: null,
      };
    })
    .filter(Boolean) as any[];

  return {
    success: true,
    message: "Open matches retrieved successfully",
    data: processedBookings,
    meta: {
      totalMatches,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalMatches / limitNumber),
      isSpecificDate: !!date,
      date: startOfDay,
      isToday: isToday,
    },
  };
};

export const getOpenMatchesByIdServices = async (
  req: Request,
  res: Response
) => {
  const { id } = req.params;

  // Find the booking by ID
  const booking = await bookingModel
    .findOne({
      _id: id,
    })
    .populate("venueId", "name city state address image")
    .populate("courtId", "name games hourlyRate image")
    .lean();

  if (!booking) {
    return {
      success: false,
      message: "Booking not found",
    };
  }

  // Extract all player IDs from both teams
  const playerIds = new Set<string>();

  booking.team1?.forEach((player: any) => {
    if (player.playerId) playerIds.add(player.playerId.toString());
  });

  booking.team2?.forEach((player: any) => {
    if (player.playerId) playerIds.add(player.playerId.toString());
  });

  // Get player data (name and image only)
  const players = await usersModel
    .find({
      _id: { $in: Array.from(playerIds) },
    })
    .select("_id fullName profilePic")
    .lean();

  // Create a map of players by ID for quick lookup
  const playersMap = players.reduce((map, player) => {
    map[player._id.toString()] = {
      _id: player._id,
      name: player.fullName,
      image: player.profilePic,
    };
    return map;
  }, {} as Record<string, any>);

  // Process team1 players
  const processedTeam1 = (booking.team1 || []).map((player: any) => {
    const playerId = player.playerId?.toString();
    return {
      ...player,
      playerData: playerId ? playersMap[playerId] : null,
    };
  });

  // Process team2 players
  const processedTeam2 = (booking.team2 || []).map((player: any) => {
    const playerId = player.playerId?.toString();
    return {
      ...player,
      playerData: playerId ? playersMap[playerId] : null,
    };
  });

  // Create the processed booking with player data
  const processedBooking = {
    ...booking,
    team1: processedTeam1,
    team2: processedTeam2,
  };

  return {
    success: true,
    message: "Booking retrieved successfully",
    data: processedBooking,
  };
};
