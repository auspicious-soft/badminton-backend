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

//Old Code
// export const userHomeServices = async (req: Request, res: Response) => {
//   const userData = req.user as any;
//   const currentDate = new Date().toISOString();
//   const matchQuery = {
//     $or: [
//       {
//         team1: {
//           $elemMatch: {
//             playerId: new mongoose.Types.ObjectId(userData.id),
//             paymentStatus: "Paid",
//           },
//         },
//       },
//       {
//         team2: {
//           $elemMatch: {
//             playerId: new mongoose.Types.ObjectId(userData.id),
//             paymentStatus: "Paid",
//           },
//         },
//       },
//     ],
//     bookingDate: { $gte: currentDate },
//     bookingType: { $ne: "Cancelled" },
//   };

//   // Fetch data in parallel
//   const nearbyVenuesPromise = venueModel
//       .find({ isActive: true })
//       .select("name city state image weather location")
//       .lean();

//   const [nearbyVenues, allMatches, banners, userLoyalty] = await Promise.all([
//     nearbyVenuesPromise,
//     bookingModel.find(matchQuery).lean(),
//     adminSettingModel
//       .findOne({ isActive: true })
//       .select("banners loyaltyPoints")
//       .lean(),
//     additionalUserInfoModel.findOne({ userId: userData.id }).lean(),
//   ]);

//   const perMatch = banners?.loyaltyPoints?.perMatch || 200;
//   const limit = banners?.loyaltyPoints?.limit || 2000;

//   const level = (userLoyalty?.loyaltyPoints || 0) / perMatch;
//   const totalLevel = limit / perMatch;

//   const clubResponse = await usersModel
//     .findById(userData.id)
//     .select("clubResponse")
//     .lean();

//   const padelResponse = {
//     games:
//       (userLoyalty?.padelLoyalty || 0) /
//       (banners?.loyaltyPoints?.perMatch || 200),
//     gamesLeft:
//       (banners?.loyaltyPoints?.limit || 2000) /
//         (banners?.loyaltyPoints?.perMatch || 200) -
//       (userLoyalty?.padelLoyalty || 0) /
//         (banners?.loyaltyPoints?.perMatch || 200),
//     plancoinEarned: userLoyalty?.earnedPadel || 0,
//     totalLevels: totalLevel,
//   };
//   const pickleballResponse = {
//     games:
//       (userLoyalty?.pickleballLoyalty || 0) /
//       (banners?.loyaltyPoints?.perMatch || 200),
//     gamesLeft:
//       (banners?.loyaltyPoints?.limit || 2000) /
//         (banners?.loyaltyPoints?.perMatch || 200) -
//       (userLoyalty?.pickleballLoyalty || 0) /
//         (banners?.loyaltyPoints?.perMatch || 200),
//     plancoinEarned: userLoyalty?.earnedPickleball || 0,
//     totalLevels: totalLevel,
//   };
//   const data = {
//     banners: banners?.banners || [],
//     upcomingMatches: allMatches,
//     venueNearby: nearbyVenues,
//     playersRanking: [], // Can be fetched in parallel too if added later
//     clubResponse: clubResponse?.clubResponse ? true : false,
//     padelResponse,
//     pickleballResponse,
//   };

//   return {
//     success: true,
//     message: "User home data retrieved successfully",
//     data,
//   };
// };

export const userHomeServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const userId = new mongoose.Types.ObjectId(userData.id);
  const currentDate = new Date().toISOString();

  const matchQuery = {
    $or: [
      { "team1.playerId": userId, "team1.paymentStatus": "Paid" },
      { "team2.playerId": userId, "team2.paymentStatus": "Paid" },
    ],
    bookingDate: { $gte: currentDate },
    bookingType: { $ne: "Cancelled" },
  };

  // run everything in parallel, including clubResponse
  const [nearbyVenues, allMatches, adminSettings, userLoyalty, clubResponse] =
    await Promise.all([
      venueModel
        .find({ isActive: true })
        .select("name city state image weather location")
        .limit(20)
        .lean(),

      bookingModel.find(matchQuery).lean(),

      adminSettingModel
        .findOne({ isActive: true })
        .select("banners loyaltyPoints")
        .lean(),

      additionalUserInfoModel.findOne({ userId }).lean(),

      usersModel.findById(userId).select("clubResponse").lean(),
    ]);

  const perMatch = adminSettings?.loyaltyPoints?.perMatch ?? 200;
  const limit = adminSettings?.loyaltyPoints?.limit ?? 2000;
  const totalLevel = limit / perMatch;

  const padelResponse = {
    games: (userLoyalty?.padelLoyalty ?? 0) / perMatch,
    gamesLeft: totalLevel - (userLoyalty?.padelLoyalty ?? 0) / perMatch,
    plancoinEarned: userLoyalty?.earnedPadel ?? 0,
    totalLevels: totalLevel,
  };

  const pickleballResponse = {
    games: (userLoyalty?.pickleballLoyalty ?? 0) / perMatch,
    gamesLeft: totalLevel - (userLoyalty?.pickleballLoyalty ?? 0) / perMatch,
    plancoinEarned: userLoyalty?.earnedPickleball ?? 0,
    totalLevels: totalLevel,
  };

  return {
    success: true,
    message: "User home data retrieved successfully",
    data: {
      banners: adminSettings?.banners ?? [],
      upcomingMatches: allMatches,
      venueNearby: nearbyVenues,
      playersRanking: [],
      clubResponse: !!clubResponse?.clubResponse,
      padelResponse,
      pickleballResponse,
    },
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

//Old Code
// export const getVenuesServices = async (req: Request, res: Response) => {
//   try {
//     const userData = req.user as any;
//     const {
//       date = new Date().toISOString(),
//       game = "all",
//     } = req.query;

//     const requestDate = new Date(date as string);
//     requestDate.setHours(0, 0, 0, 0);
//     const endOfDay = new Date(requestDate);
//     endOfDay.setHours(23, 59, 59, 999);

//     // Build geo query
//     const geoQuery: any = { isActive: true };
//     if (game !== "all") geoQuery.gamesAvailable = { $in: [game] };
//     const venues = await venueModel.aggregate([
//       {
//         $project: {
//           _id: 1,
//           name: 1,
//           address: 1,
//           city: 1,
//           state: 1,
//           image: 1,
//           gamesAvailable: 1,
//           timeslots: 1,
//           weather: 1,
//         },
//       },
//     ]);

//     if (venues.length === 0) {
//       return {
//         success: true,
//         message: "No venues found",
//         data: [],
//       };
//     }

//     const venueIds = venues.map((v) => v._id);

//     // Prepare court query
//     const courtsQuery: any = {
//       venueId: { $in: venueIds },
//       isActive: true,
//     };
//     if (game !== "all") courtsQuery.games = game;

//     // Parallel fetch: courts and bookings
//     const [courts, bookings] = await Promise.all([
//       courtModel
//         .find(courtsQuery)
//         .select("_id name venueId games hourlyRate image")
//         .lean(),
//       bookingModel
//         .find({
//           venueId: { $in: venueIds },
//           bookingDate: { $gte: requestDate, $lte: endOfDay },
//         })
//         .lean(),
//     ]);

//     // Group courts by venue
//     const courtsByVenue: Record<string, any[]> = {};
//     courts.forEach((court) => {
//       const venueId = court.venueId.toString();
//       if (!courtsByVenue[venueId]) courtsByVenue[venueId] = [];
//       courtsByVenue[venueId].push(court);
//     });

//     // Map of booked slots
//     const bookedSlots: Record<string, Record<string, string[]>> = {};
//     bookings.forEach((booking: any) => {
//       const venueId = booking.venueId.toString();
//       const courtId = booking.courtId.toString();

//       if (!bookedSlots[venueId]) bookedSlots[venueId] = {};
//       if (!bookedSlots[venueId][courtId]) bookedSlots[venueId][courtId] = [];

//       if (Array.isArray(booking.bookingSlots)) {
//         bookedSlots[venueId][courtId].push(...booking.bookingSlots);
//       } else {
//         bookedSlots[venueId][courtId].push(booking.bookingSlots);
//       }
//     });

//     // Prepare response
//     const dateString = requestDate.toLocaleDateString("en-CA");
//     const formattedDate = new Intl.DateTimeFormat("en-US", {
//       weekday: "long",
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//     }).format(requestDate);

//     const result = venues.map((venue: any) => {
//       const venueId = venue._id.toString();
//       const venueCourts = courtsByVenue[venueId] || [];

//       const courtsWithAvailability = venueCourts.map((court: any) => {
//         return { ...court, availableSlots: [] };
//       });

//       return {
//         _id: venue._id,
//         name: venue.name,
//         address: venue.address,
//         city: venue.city,
//         state: venue.state,
//         image: venue.image,
//         gamesAvailable: venue.gamesAvailable,
//         facilities: venue.facilities,
//         weather: venue.weather,
//         venueInfo: venue.venueInfo,
//         distance: venue.distance,
//         location: venue.location,
//         date: dateString,
//         formattedDate: formattedDate,
//         courts: courtsWithAvailability,
//         hasFilteredCourts: courtsWithAvailability.length > 0,
//       };
//     });

//     return {
//       success: true,
//       message: "Venues retrieved successfully",
//       data: result,
//     };
//   } catch (error) {
//     console.error("Error in getVenuesServices:", error);
//     return errorResponseHandler(
//       "Error retrieving venues: " + (error as Error).message,
//       httpStatusCode.INTERNAL_SERVER_ERROR,
//       res
//     );
//   }
// };

export const getVenuesServices = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const { date = new Date().toISOString(), game = "all" } = req.query;

    const requestDate = new Date(date as string);
    requestDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Filter for active venues and game type
    const matchQuery: any = { isActive: true };
    if (game !== "all") matchQuery.gamesAvailable = { $in: [game] };

    // Fetch filtered venues directly (no full scan)
    const venues = await venueModel
      .find(matchQuery)
      .select(
        "_id name address city state image gamesAvailable timeslots weather"
      )
      .limit(50) // limit result size for performance
      .lean();

    if (!venues.length) {
      return { success: true, message: "No venues found", data: [] };
    }

    const venueIds = venues.map((v) => v._id);

    // Prepare queries
    const courtsQuery: any = { venueId: { $in: venueIds }, isActive: true };
    if (game !== "all") courtsQuery.games = game;

    // Fetch courts + bookings in parallel
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
        .select("venueId courtId bookingSlots")
        .lean(),
    ]);

    // Group courts by venue
    const courtsByVenue = new Map<string, any[]>();
    for (const court of courts) {
      const venueId = court.venueId.toString();
      if (!courtsByVenue.has(venueId)) courtsByVenue.set(venueId, []);
      courtsByVenue.get(venueId)!.push(court);
    }

    // Group booked slots
    const bookedSlots = new Map<string, Map<string, string[]>>();
    for (const booking of bookings) {
      const venueId = booking.venueId.toString();
      const courtId = booking.courtId.toString();

      if (!bookedSlots.has(venueId)) bookedSlots.set(venueId, new Map());
      const courtMap = bookedSlots.get(venueId)!;
      if (!courtMap.has(courtId)) courtMap.set(courtId, []);

      const slotArr = Array.isArray(booking.bookingSlots)
        ? booking.bookingSlots
        : [booking.bookingSlots];
      courtMap.get(courtId)!.push(...slotArr);
    }

    const dateString = requestDate.toLocaleDateString("en-CA");
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(requestDate);

    const result = venues.map((venue) => {
      const venueId = venue._id.toString();
      const venueCourts = courtsByVenue.get(venueId) || [];

      const courtsWithAvailability = venueCourts.map((court) => ({
        ...court,
        availableSlots: [], // placeholder for now
      }));

      return {
        ...venue,
        date: dateString,
        formattedDate,
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

//Old Code
// export const getCourtsServices = async (req: Request, res: Response) => {
//   try {
//     const { venueId, date, game } = req.query;

//     if (!venueId) {
//       return errorResponseHandler(
//         "Venue ID is required",
//         httpStatusCode.BAD_REQUEST,
//         res
//       );
//     }

//     // Step 1: Fetch venue
//     const venueData = await venueModel
//       .findById(venueId)
//       .select("-employees")
//       .lean();

//     if (!venueData) {
//       return errorResponseHandler(
//         "Venue not found",
//         httpStatusCode.BAD_REQUEST,
//         res
//       );
//     }

//     // Step 2: Fetch courts
//     const courtsQuery: any = {
//       venueId: venueId,
//       isActive: true,
//     };

//     if (game && game !== "all") {
//       courtsQuery.games = game;
//     }

//     const courts = await courtModel
//       .find(courtsQuery)
//       .select("_id name venueId games hourlyRate image")
//       .lean();

//     // Step 3: If no date provided, return early
//     if (!date) {
//       return {
//         success: true,
//         message: "Courts retrieved successfully",
//         data: {
//           ...venueData,
//           courts,
//         },
//       };
//     }

//     // Step 4: Date-specific processing
//     const requestDate = new Date(date as string);
//     requestDate.setHours(0, 0, 0, 0);
//     const endOfDay = new Date(requestDate);
//     endOfDay.setHours(23, 59, 59, 999);

//     const istTime = getCurrentISTTime();
//     const isRequestedDateToday = isDateTodayInIST(requestDate);
//     const currentHour = istTime.getHours();

//     const dayOfWeek = requestDate.getDay();
//     const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
//     const dayType = isWeekend ? "weekend" : "weekday";

//     const indiaToday = `${date}T00:00:00.000+00:00`;

//     // Fetch pricing and bookings in parallel
//     const [pricing, allBookings] = await Promise.all([
//       dynamicPrizeModel.find({ date: indiaToday }).lean(),
//       bookingModel
//         .find({
//           venueId,
//           bookingType: { $ne: "Cancelled" },
//           bookingDate: { $gte: requestDate, $lte: endOfDay },
//         })
//         .lean(),
//     ]);

//     const confirmedSlots: Record<string, string[]> = {};
//     const pendingSlots: Record<string, string[]> = {};

//     for (const booking of allBookings) {
//       const courtId = booking.courtId?.toString?.() ?? String(booking.courtId);
//       const target = booking.bookingPaymentStatus
//         ? confirmedSlots
//         : pendingSlots;

//       if (!target[courtId]) {
//         target[courtId] = [];
//       }

//       const slots = Array.isArray(booking.bookingSlots)
//         ? booking.bookingSlots
//         : [booking.bookingSlots];

//       target[courtId].push(...slots);
//     }

//     const dateString = requestDate.toLocaleDateString("en-CA");
//     const formattedDate = new Intl.DateTimeFormat("en-US", {
//       weekday: "long",
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//     }).format(requestDate);

//     const courtsWithAvailability = courts.map((court) => {
//       const courtId = court._id.toString();
//       const confirmed = confirmedSlots[courtId] || [];
//       const venueTimeslots = venueData.timeslots || VENUE_TIME_SLOTS;
//       const baseRate = court.hourlyRate || 1200;

//       const availableSlots = venueTimeslots.map((slot: string) => {
//         const slotHour = parseInt(slot.split(":")[0], 10);
//         const isPast = isRequestedDateToday && slotHour <= currentHour;
//         const isBooked = confirmed.includes(slot);
//         const isAvailable = !isBooked && !isPast;

//         let price = baseRate;
//         let isDiscounted = false;
//         let isPremium = false;

//         const courtSlots = pricing.find((p) => String(p.courtId) === courtId);

//         if (courtSlots) {
//           const match = courtSlots?.slotPricing?.find(
//             (s: any) => s.slot === slot
//           );
//           price = match?.price || baseRate;
//           isDiscounted = price < baseRate;
//           isPremium = price > baseRate;
//         } else {
//           price = baseRate;
//           isDiscounted = price < baseRate;
//           isPremium = price > baseRate;
//         }

//         return {
//           time: slot,
//           price,
//           isDiscounted,
//           isPremium,
//           isAvailable,
//           isConfirmedBooked: isBooked,
//           isPastSlot: isPast,
//         };
//       });

//       return {
//         ...court,
//         availableSlots,
//       };
//     });

//     return {
//       success: true,
//       message: "Courts retrieved successfully",
//       data: {
//         ...venueData,
//         courts: courtsWithAvailability,
//         date: dateString,
//         formattedDate,
//         dayType,
//       },
//     };
//   } catch (error) {
//     console.error("Error in getCourtsServices:", error);
//     return errorResponseHandler(
//       "Error retrieving courts: " + (error as Error).message,
//       httpStatusCode.INTERNAL_SERVER_ERROR,
//       res
//     );
//   }
// };

export const getCourtsServices = async (req: Request, res: Response) => {
  try {
    const { venueId, date, game } = req.query;

    if (!venueId) {
      return errorResponseHandler(
        "Venue ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

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

    const courtsQuery: any = { venueId, isActive: true };
    if (game && game !== "all") courtsQuery.games = game;

    const courts = await courtModel
      .find(courtsQuery)
      .select("_id name venueId games hourlyRate image")
      .lean();

    if (!date) {
      return {
        success: true,
        message: "Courts retrieved successfully",
        data: { ...venueData, courts },
      };
    }

    // ---- Date setup ----
    const requestDate = new Date(date as string);
    requestDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);

    const istTime = getCurrentISTTime();
    const isRequestedDateToday = isDateTodayInIST(requestDate);
    const currentHour = istTime.getHours();
    const dayOfWeek = requestDate.getDay();
    const dayType = dayOfWeek === 0 || dayOfWeek === 6 ? "weekend" : "weekday";
    const indiaToday = `${date}T00:00:00.000+00:00`;

    // ---- Fetch bookings + pricing ----
    const [pricing, allBookings] = await Promise.all([
      dynamicPrizeModel
        .find({ date: indiaToday })
        .select("courtId slotPricing")
        .lean(),
      bookingModel
        .find({
          venueId,
          bookingType: { $ne: "Cancelled" },
          bookingDate: { $gte: requestDate, $lte: endOfDay },
        })
        .select("courtId bookingSlots bookingPaymentStatus")
        .lean(),
    ]);

    // ---- Build fast lookup maps ----
    const confirmedSlots = new Map<string, string[]>();
    const pendingSlots = new Map<string, string[]>();
    const pricingMap = new Map<string, any>();
    pricing.forEach((p) => pricingMap.set(String(p.courtId), p));

    for (const booking of allBookings) {
      const courtId = String(booking.courtId);
      const slots = Array.isArray(booking.bookingSlots)
        ? booking.bookingSlots
        : [booking.bookingSlots];
      const target = booking.bookingPaymentStatus
        ? confirmedSlots
        : pendingSlots;
      const existing = target.get(courtId) || [];
      target.set(courtId, [...existing, ...slots]);
    }

    // ---- Prepare response ----
    const dateString = requestDate.toLocaleDateString("en-CA");
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(requestDate);

    const venueTimeslots = venueData.timeslots || VENUE_TIME_SLOTS;

    const courtsWithAvailability = courts.map((court : any) => {
      const courtId = String(court._id);
      const confirmed = confirmedSlots.get(courtId) || [];
      // const baseRate = court.hourlyRate || 1200;
      const courtSlots = pricingMap.get(courtId);

      // const availableSlots = venueTimeslots.map((slot: string) => {
      //   const slotHour = parseInt(slot.split(":")[0], 10);
      //   const isPast = isRequestedDateToday && slotHour <= currentHour;
      //   const isBooked = confirmed.includes(slot);
      //   const isAvailable = !isBooked && !isPast;

      //   const match = courtSlots?.slotPricing?.find(
      //     (s: any) => s.slot === slot
      //   );
      //   const price = match?.price ?? baseRate;
      //   return {
      //     time: slot,
      //     price,
      //     isDiscounted: price < baseRate,
      //     isPremium: price > baseRate,
      //     isAvailable,
      //     isConfirmedBooked: isBooked,
      //     isPastSlot: isPast,
      //   };
      // });
      const availableSlots = venueTimeslots.map((slot: string) => {
        const slotHour = parseInt(slot.split(":")[0], 10);

        const isPast = isRequestedDateToday && slotHour <= currentHour;
        const isBooked = confirmed.includes(slot);
        const isAvailable = !isBooked && !isPast;

        // NEW: slot-based base rate
        const baseRate = court?.hourlyRate?.[slot] ?? 1200;

        // dynamic price override
        const match = courtSlots?.slotPricing?.find(
          (s: any) => s.slot === slot
        );
        const price = match?.price ?? baseRate;

        return {
          time: slot,
          price, // ✔ final price
          basePrice: baseRate, // optional: if you want to show base price
          isDiscounted: price < baseRate,
          isPremium: price > baseRate,
          isAvailable,
          isConfirmedBooked: isBooked,
          isPastSlot: isPast,
        };
      });

      return { ...court, availableSlots };
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
//   const { date, game = "all", page = 1, limit = 10 } = req.query;

//   const pageNumber = Number(page);
//   const limitNumber = Number(limit);
//   const skip = (pageNumber - 1) * limitNumber;

//   let startOfDay = new Date().toISOString() as any;
//   let endOfDay = new Date(
//     new Date().setHours(23, 59, 59, 999)
//   ).toISOString() as any;

//   if (date) {
//     startOfDay = new Date(date as string);
//     startOfDay.setUTCHours(0, 0, 0, 0);
//     endOfDay = new Date(date as string);
//     endOfDay.setUTCHours(23, 59, 59, 999);
//     startOfDay = startOfDay.toISOString();
//     endOfDay = endOfDay.toISOString();
//   }

//   const isToday =
//     startOfDay.split("T")[0] === new Date().toISOString().split("T")[0];

//   let dateQuery: any = {};
//   if (date) {
//     dateQuery = {
//       $gt: isToday ? new Date().toISOString() : startOfDay,
//       $lte: endOfDay,
//     };
//   } else {
//     dateQuery = {
//       $gt: isToday ? new Date().toISOString() : startOfDay,
//     };
//   }

//   const userObjectId = new mongoose.Types.ObjectId(userData.id);

//   // Count total matches (before pagination)
//   const totalMatches = await bookingModel.countDocuments({
//     askToJoin: true,
//     bookingDate: dateQuery,
//     bookingType: { $ne: "Cancelled" },
//     bookingPaymentStatus: true,
//     $nor: [
//       { "team1.playerId": userObjectId },
//       { "team2.playerId": userObjectId },
//     ],
//   });

//   // 1. Fetch bookings with pagination
//   const bookings = await bookingModel
//     .find({
//       askToJoin: true,
//       bookingDate: dateQuery,
//       bookingType: { $ne: "Cancelled" },
//       bookingPaymentStatus: true,
//       $nor: [
//         { "team1.playerId": userObjectId },
//         { "team2.playerId": userObjectId },
//       ],
//     })
//     .sort({ bookingDate: 1 })
//     .skip(skip)
//     .limit(limitNumber)
//     .lean();

//   if (!bookings.length) {
//     return {
//       success: true,
//       message: "No open matches found",
//       data: [],
//       meta: {
//         totalMatches: 0,
//         date: startOfDay,
//         isSpecificDate: !!date,
//         isToday: true,
//         currentPage: pageNumber,
//         totalPages: 0,
//       },
//     };
//   }

//   const venueIds = [...new Set(bookings.map((b) => b.venueId.toString()))];
//   const courtIds = [...new Set(bookings.map((b) => b.courtId.toString()))];

//   const [venues, courts, users] = await Promise.all([
//     venueModel
//       .find({ _id: { $in: venueIds }, isActive: true })
//       .select("_id name city state address image weather location")
//       .lean(),
//     courtModel
//       .find({
//         _id: { $in: courtIds },
//         isActive: true,
//         ...(game !== "all" && { games: game }),
//       })
//       .select("_id name venueId games hourlyRate image")
//       .lean(),
//     usersModel
//       .find({
//         _id: {
//           $in: Array.from(
//             bookings.flatMap((b) => [
//               ...b.team1.map((p: any) => p.playerId),
//               ...b.team2.map((p: any) => p.playerId),
//             ])
//           ),
//         },
//       })
//       .select("_id fullName profilePic")
//       .lean(),
//   ]);

//   const venuesMap = new Map(venues.map((v) => [v._id.toString(), v]));
//   const courtsMap = new Map(courts.map((c) => [c._id.toString(), c]));
//   const usersMap = new Map(
//     users.map((u) => [
//       u._id.toString(),
//       { _id: u._id, name: u.fullName, image: u.profilePic },
//     ])
//   );

//   const processedBookings = bookings
//     .map((booking) => {
//       const venue = venuesMap.get(booking.venueId.toString());
//       const court = courtsMap.get(booking.courtId.toString());
//       if (!venue || !court) return null;

//       const formatTeam = (team: any[]) =>
//         team.map((player) => ({
//           playerType: player.playerType,
//           player:
//             player.playerId && usersMap.has(player.playerId.toString())
//               ? usersMap.get(player.playerId.toString())
//               : null,
//         }));

//       const bookingDate = new Date(booking.bookingDate);
//       const formattedDate = new Intl.DateTimeFormat("en-US", {
//         weekday: "long",
//         year: "numeric",
//         month: "long",
//         day: "numeric",
//       }).format(bookingDate);

//       return {
//         _id: booking._id,
//         bookingDate,
//         formattedDate,
//         bookingSlots: booking.bookingSlots,
//         askToJoin: booking.askToJoin,
//         isCompetitive: booking.isCompetitive,
//         skillRequired: booking.skillRequired,
//         team1: formatTeam(booking.team1),
//         team2: formatTeam(booking.team2),
//         venue: {
//           _id: venue._id,
//           name: venue.name,
//           city: venue.city,
//           state: venue.state,
//           address: venue.address,
//           image: venue.image,
//           weather: venue.weather,
//         },
//         court,
//         distance: null,
//       };
//     })
//     .filter(Boolean) as any[];

//   return {
//     success: true,
//     message: "Open matches retrieved successfully",
//     data: processedBookings,
//     meta: {
//       totalMatches,
//       currentPage: pageNumber,
//       totalPages: Math.ceil(totalMatches / limitNumber),
//       isSpecificDate: !!date,
//       date: startOfDay,
//       isToday: isToday,
//     },
//   };
// };

export const getOpenMatchesServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { date, game = "all", page = 1, limit = 10 } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  // ----------------------------
  // 1️⃣ Prepare date range safely
  // ----------------------------
  let startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  let endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);

  if (date) {
    const dStart = new Date(date as string);
    const dEnd = new Date(date as string);
    dStart.setUTCHours(0, 0, 0, 0);
    dEnd.setUTCHours(23, 59, 59, 999);
    startOfDay = dStart;
    endOfDay = dEnd;
  }

  const isToday =
    startOfDay.toISOString().split("T")[0] ===
    new Date().toISOString().split("T")[0];

  const dateQuery = {
    $gt: isToday ? new Date() : startOfDay,
    ...(date && { $lte: endOfDay }),
  };

  const userObjectId = new mongoose.Types.ObjectId(userData.id);

  // --------------------------------------------------
  // 2️⃣ Fetch total count + paginated results together
  // --------------------------------------------------
  const [result] = await bookingModel.aggregate([
    {
      $match: {
        askToJoin: true,
        bookingPaymentStatus: true,
        bookingType: { $ne: "Cancelled" },
        bookingDate: dateQuery,
        $nor: [
          { "team1.playerId": userObjectId },
          { "team2.playerId": userObjectId },
        ],
      },
    },
    { $sort: { bookingDate: 1 } },
    {
      $facet: {
        totalCount: [{ $count: "count" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  ]);

  const totalMatches = result?.totalCount?.[0]?.count || 0;
  const bookings = result?.data || [];

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

  // --------------------------------------------
  // 3️⃣ Collect unique IDs to reduce DB roundtrips
  // --------------------------------------------
  const venueIds = [...new Set(bookings.map((b: any) => b.venueId.toString()))];
  const courtIds = [...new Set(bookings.map((b: any) => b.courtId.toString()))];

  const playerIds = new Set<string>();
  for (const b of bookings) {
    for (const p of b.team1 || []) playerIds.add(String(p.playerId));
    for (const p of b.team2 || []) playerIds.add(String(p.playerId));
  }

  // -------------------------------------
  // 4️⃣ Parallel fetch of related documents
  // -------------------------------------
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
      .find({ _id: { $in: Array.from(playerIds) } })
      .select("_id fullName profilePic")
      .lean(),
  ]);

  // ------------------------------------------
  // 5️⃣ Build quick-access maps for fast lookup
  // ------------------------------------------
  const venuesMap = new Map(venues.map((v) => [v._id.toString(), v]));
  const courtsMap = new Map(courts.map((c) => [c._id.toString(), c]));
  const usersMap = new Map(
    users.map((u) => [
      u._id.toString(),
      { _id: u._id, name: u.fullName, image: u.profilePic },
    ])
  );

  // -------------------------
  // 6️⃣ Date formatter reuse
  // -------------------------
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // -----------------------------------
  // 7️⃣ Transform booking output safely
  // -----------------------------------
  const processedBookings = bookings
    .map((booking: any) => {
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

      return {
        _id: booking._id,
        bookingDate: booking.bookingDate,
        formattedDate: formatter.format(new Date(booking.bookingDate)),
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
    .filter(Boolean);

  // ----------------------------
  // 8️⃣ Final structured response
  // ----------------------------
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
      isToday,
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
