import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { venueModel } from "src/models/venue/venue-schema";
import { httpStatusCode, VENUE_TIME_SLOTS } from "src/lib/constant";
import { bookingModel } from "src/models/venue/booking-schema";
import { friendsModel } from "src/models/user/friends-schema";
import { usersModel } from "src/models/user/user-schema";
import mongoose from "mongoose";
import { createNotification } from "src/models/notification/notification-schema";
import { courtModel } from "src/models/venue/court-schema";

export const userHomeServices = async (req: Request, res: Response) => {
  let nearbyVenues = [];
  const userData = req.user as any;
  let { nearBy = true, lng: lngQuery = null, lat: latQuery = null } = req.query;
  let lng: number | null = null;
  let lat: number | null = null;

  if (lngQuery && latQuery) {
    lng = Number(lngQuery);
    lat = Number(latQuery);

    // Define a reasonable maximum distance
    // 30 km in meters = 30,000 meters
    const MAX_NEARBY_DISTANCE = 30000000; // 30 km in meters

    const geoNearStage: any = {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distance",
        spherical: true,
      },
    };

    if (nearBy !== "false") {
      geoNearStage.$geoNear.maxDistance = MAX_NEARBY_DISTANCE;
    } else {
      // If not nearby, still use a reasonable maximum distance
      // 100 km in meters = 100,000 meters
      geoNearStage.$geoNear.maxDistance = 100000000; // 100 km in meters
    }

    const pipeline: any[] = [
      geoNearStage,
      {
        $match: {
          isActive: true,
        },
      },
      {
        $project: {
          name: 1,
          city: 1,
          state: 1,
          image: 1,
          distance: {
            $round: [{ $divide: ["$distance", 1000] }, 1],
          },
          weather: 1,
        },
      },
    ];

    nearbyVenues = await venueModel.aggregate(pipeline);
  } else {
    nearbyVenues = await venueModel
      .find({ isActive: true })
      .select("name city state image weather")
      .lean();
  }

  const upcomingMatchData = await bookingModel.aggregate([
    {
      $match: {
        bookingDate: { $gte: new Date() },
        $or: [
          {
            $and: [
              { bookingType: "Self" },
              {
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
              },
            ],
          },
          {
            $and: [
              { bookingType: { $in: ["Booking", "Complete"] } },
              { bookingPaymentStatus: true },
              {
                $or: [
                  {
                    team1: {
                      $elemMatch: {
                        playerId: new mongoose.Types.ObjectId(userData.id),
                      },
                    },
                  },
                  {
                    team2: {
                      $elemMatch: {
                        playerId: new mongoose.Types.ObjectId(userData.id),
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      $sort: {
        bookingDate: 1,
        bookingSlots: 1,
      },
    },
  ]);

  const data = {
    banners: [],
    upcomingMatches: upcomingMatchData,
    venueNearby: nearbyVenues,
    playersRanking: [],
    loyaltyPoints: { points: 0, level: 0, totalLevels: 5 },
  };

  return {
    success: true,
    message: "User home data retrieved successfully",
    data,
  };
};

export const getVenuesServices = async (req: Request, res: Response) => {
  try {
    const { date, distance = "ASC", game = "all", lng, lat } = req.query;

    if (!lng || !lat || !date) {
      return errorResponseHandler(
        "Invalid Payload",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Convert coordinates to numbers
    const lngNum = Number(lng);
    const latNum = Number(lat);

    // Parse the input date
    const requestDate = new Date(date as string);
    requestDate.setHours(0, 0, 0, 0); // Set to beginning of day

    // End of the requested day
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if the requested date is today
    const today = new Date();
    const isRequestedDateToday =
      requestDate.toDateString() === today.toDateString();
    const currentHour = today.getHours();

    // Step 1: Get venues based on location
    const geoQuery: any = { isActive: true };

    // Only filter venues by game if game is specified
    if (game !== "all") {
      geoQuery.gamesAvailable = { $in: [game] };
    }

    // Earth's radius is approximately 6371 km
    // 100 km in meters = 100,000 meters
    // This is a reasonable maximum distance for venue searches
    const MAX_SEARCH_DISTANCE = 10000000; // 100 km in meters

    const venues = await venueModel.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lngNum, latNum] },
          distanceField: "distance",
          spherical: true,
          maxDistance: MAX_SEARCH_DISTANCE,
          query: geoQuery,
        },
      },
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
          distance: { $round: [{ $divide: ["$distance", 1000] }, 1] },
        },
      },
      { $sort: { distance: distance === "ASC" ? 1 : -1 } },
    ]);

    if (venues.length === 0) {
      return {
        success: true,
        message: "No venues found",
        data: [],
      };
    }

    // Step 2: Get all courts for these venues
    const venueIds = venues.map((venue: any) => venue._id);
    console.log(`Venue IDs: ${venueIds.length}`, venueIds);

    // Base query to get active courts for the venues
    let courtsQuery: any = {
      venueId: { $in: venueIds },
      isActive: true,
    };

    // Filter courts by game type if specified
    if (game !== "all") {
      courtsQuery.games = game;
    }

    const courts = await courtModel
      .find(courtsQuery)
      .select("_id name venueId games hourlyRate image")
      .lean();

    // Group courts by venue ID
    const courtsByVenue: Record<string, any[]> = {};
    courts.forEach((court: any) => {
      const venueId = court.venueId.toString();
      if (!courtsByVenue[venueId]) {
        courtsByVenue[venueId] = [];
      }
      courtsByVenue[venueId].push(court);
    });

    // Log which venues have courts after game filtering
    venueIds.forEach((id) => {
      const venueIdStr = id.toString();
      console.log(
        `Venue ${venueIdStr} has ${
          courtsByVenue[venueIdStr]?.length || 0
        } courts after game filtering`
      );
    });

    // Step 3: Get all bookings for the specific date
    const bookings = await bookingModel
      .find({
        venueId: { $in: venueIds },
        bookingDate: {
          $gte: requestDate,
          $lte: endOfDay,
        },
      })
      .lean();

    // Create a map of booked slots by venue and court
    const bookedSlots: Record<string, Record<string, string[]>> = {};

    bookings.forEach((booking: any) => {
      // Handle different ObjectId formats
      const venueId =
        typeof booking.venueId === "object" && booking.venueId !== null
          ? booking.venueId.toString
            ? booking.venueId.toString()
            : String(booking.venueId)
          : booking.venueId;

      const courtId =
        typeof booking.courtId === "object" && booking.courtId !== null
          ? booking.courtId.toString
            ? booking.courtId.toString()
            : String(booking.courtId)
          : booking.courtId;

      if (!bookedSlots[venueId]) {
        bookedSlots[venueId] = {};
      }

      if (!bookedSlots[venueId][courtId]) {
        bookedSlots[venueId][courtId] = [];
      }

      // Handle both array and string cases for bookingSlots
      if (Array.isArray(booking.bookingSlots)) {
        bookedSlots[venueId][courtId].push(...booking.bookingSlots);
      } else {
        bookedSlots[venueId][courtId].push(booking.bookingSlots);
      }
    });

    // Format the date for display
    const dateString = requestDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(requestDate);

    // Format the result - include ALL venues, but only include courts that match the game filter
    const result = venues.map((venue: any) => {
      const venueId = venue._id.toString();
      const venueCourts = courtsByVenue[venueId] || [];

      // Include empty courts array if no courts found for this venue with the selected game
      const venueTimeslots = venue.timeslots || VENUE_TIME_SLOTS;

      // Add availability to each court (if any)
      const courtsWithAvailability = venueCourts.map((court: any) => {
        const courtId = court._id.toString();
        const courtBookedSlots = bookedSlots[venueId]?.[courtId] || [];

        // Filter available slots
        const availableSlots = venueTimeslots.filter((slot: string) => {
          // Skip booked slots
          if (courtBookedSlots.includes(slot)) {
            return false;
          }

          // For today only, filter out past time slots
          if (isRequestedDateToday) {
            const slotHour = parseInt(slot.split(":")[0], 10);
            if (slotHour <= currentHour) {
              return false;
            }
          }

          return true;
        });

        return {
          ...court,
          availableSlots,
        };
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
        date: dateString,
        formattedDate: formattedDate,
        courts: courtsWithAvailability,
        hasFilteredCourts: courtsWithAvailability.length > 0,
      };
    });

    console.log(`Returning ${result.length} venues in the final result`);
    console.log(
      `Venues with filtered courts: ${
        result.filter((v) => v.hasFilteredCourts).length
      }`
    );

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

    // Find the venue
    const venueData = await venueModel
      .findById(venueId)
      .select("-location -employees")
      .lean();

    if (!venueData) {
      return errorResponseHandler(
        "Venue not found",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Get courts for this venue, filtered by game if specified
    let courtsQuery: any = {
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

    console.log(
      `Found ${courts.length} courts for venue ${venueId} with game filter: ${
        game || "all"
      }`
    );

    // If date is provided, get availability for that date
    if (date) {
      // Parse the input date
      const requestDate = new Date(date as string);
      requestDate.setHours(0, 0, 0, 0); // Set to beginning of day

      // End of the requested day
      const endOfDay = new Date(requestDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check if the requested date is today
      const today = new Date();
      const isRequestedDateToday =
        requestDate.toDateString() === today.toDateString();
      const currentHour = today.getHours();

      // Get all bookings for this venue on the specified date
      const bookings = await bookingModel
        .find({
          venueId: venueId,
          bookingDate: {
            $gte: requestDate,
            $lte: endOfDay,
          },
        })
        .lean();

      console.log(
        `Found ${bookings.length} bookings for venue ${venueId} on ${date}`
      );

      // Create a map of booked slots by court
      const bookedSlots: Record<string, string[]> = {};

      bookings.forEach((booking: any) => {
        const courtId =
          typeof booking.courtId === "object" && booking.courtId !== null
            ? booking.courtId.toString
              ? booking.courtId.toString()
              : String(booking.courtId)
            : booking.courtId;

        if (!bookedSlots[courtId]) {
          bookedSlots[courtId] = [];
        }

        // Handle both array and string cases for bookingSlots
        if (Array.isArray(booking.bookingSlots)) {
          bookedSlots[courtId].push(...booking.bookingSlots);
        } else {
          bookedSlots[courtId].push(booking.bookingSlots);
        }
      });

      // Format the date for display
      const dateString = requestDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(requestDate);

      // Add availability to each court
      const courtsWithAvailability = courts.map((court: any) => {
        const courtId = court._id.toString();
        const courtBookedSlots = bookedSlots[courtId] || [];
        const venueTimeslots = venueData.timeslots || VENUE_TIME_SLOTS;

        // Filter available slots
        const availableSlots = venueTimeslots.filter((slot: string) => {
          // Skip booked slots
          if (courtBookedSlots.includes(slot)) {
            return false;
          }

          // For today only, filter out past time slots
          if (isRequestedDateToday) {
            const slotHour = parseInt(slot.split(":")[0], 10);
            if (slotHour <= currentHour) {
              return false;
            }
          }

          return true;
        });

        return {
          ...court,
          availableSlots,
        };
      });

      // Add date information to the venue data
      const venueWithAvailability = {
        ...venueData,
        courts: courtsWithAvailability,
        date: dateString,
        formattedDate: formattedDate,
      };

      return {
        success: true,
        message: "Courts retrieved successfully",
        data: venueWithAvailability,
      };
    } else {
      // If no date provided, just return the venue with its courts
      const venueWithCourts = {
        ...venueData,
        courts: courts,
      };

      return {
        success: true,
        message: "Courts retrieved successfully",
        data: venueWithCourts,
      };
    }
  } catch (error) {
    console.error("Error in getCourtsServices:", error);
    return errorResponseHandler(
      "Error retrieving courts: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const getOpenMatchesServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { date, distance = "ASC", game = "all", lng, lat } = req.query;

  if (!date || !lng || !lat) {
    return errorResponseHandler(
      "Invalid Payload",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Convert coordinates to numbers
  const lngNum = Number(lng);
  const latNum = Number(lat);

  // Parse the input date and handle timezone consistently
  const requestDate = new Date(date as string);
  // Set to beginning of day in local timezone
  requestDate.setHours(0, 0, 0, 0);

  // End of the requested day in local timezone
  const endOfDay = new Date(requestDate);
  endOfDay.setHours(23, 59, 59, 999);

  console.log(`Request date: ${requestDate.toISOString()}`);
  console.log(`End of day: ${endOfDay.toISOString()}`);

  // Check if the requested date is today (comparing dates in local timezone)
  const today = new Date();
  const isRequestedDateToday =
    requestDate.getDate() === today.getDate() &&
    requestDate.getMonth() === today.getMonth() &&
    requestDate.getFullYear() === today.getFullYear();

  const currentHour = today.getHours();
  console.log(
    `Is today: ${isRequestedDateToday}, Current hour: ${currentHour}`
  );

  // First, get bookings with askToJoin = true and for the specified date
  const bookings = await bookingModel
    .find({
      askToJoin: true,
      bookingDate: {
        $gte: requestDate,
        $lte: endOfDay,
      },
    })
    .lean();

  console.log(`Found ${bookings.length} open bookings for date ${date}`);

  if (bookings.length === 0) {
    return {
      success: true,
      message: "No open matches found",
      data: [],
    };
  }

  // Get all venue IDs from the bookings
  const venueIds = [...new Set(bookings.map((booking) => booking.venueId))];

  // Get all court IDs from the bookings
  const courtIds = [...new Set(bookings.map((booking) => booking.courtId))];

  // Get venues data
  const venues = await venueModel
    .find({
      _id: { $in: venueIds },
      isActive: true,
    })
    .select("_id name city state image weather location")
    .lean();

  console.log(`Found ${venues.length} venues for open matches`);

  // Create a map of venues by ID for quick lookup
  const venuesMap = venues.reduce((map, venue) => {
    map[venue._id.toString()] = venue;
    return map;
  }, {} as Record<string, any>);

  // Get courts data with game filtering if needed
  let courtsQuery: any = {
    _id: { $in: courtIds },
    isActive: true,
  };

  if (game !== "all") {
    courtsQuery.games = game;
  }

  const courts = await courtModel
    .find(courtsQuery)
    .select("_id name venueId games hourlyRate image")
    .lean();

  console.log(
    `Found ${courts.length} courts for open matches with game filter: ${game}`
  );

  // Create a map of courts by ID for quick lookup
  const courtsMap = courts.reduce((map, court) => {
    map[court._id.toString()] = court;
    return map;
  }, {} as Record<string, any>);

  // Get all user IDs from team1 and team2
  const userIds = new Set<string>();
  bookings.forEach((booking) => {
    booking.team1?.forEach((player: any) => {
      if (player.playerId) userIds.add(player.playerId.toString());
    });
    booking.team2?.forEach((player: any) => {
      if (player.playerId) userIds.add(player.playerId.toString());
    });
  });

  // Get user data
  const users = await usersModel
    .find({
      _id: { $in: Array.from(userIds) },
    })
    .select("_id fullName profilePic")
    .lean();

  // Create a map of users by ID for quick lookup
  const usersMap = users.reduce((map, user) => {
    map[user._id.toString()] = {
      _id: user._id,
      name: user.fullName,
      image: user.profilePic,
    };
    return map;
  }, {} as Record<string, any>);

  // Process bookings to include venue, court, and player data
  const processedBookings = bookings
    .filter((booking) => {
      // Filter out bookings where the court doesn't match the game filter
      const courtId = booking.courtId.toString();
      if (!courtsMap[courtId]) return false;

      // For today, filter out bookings with slots that have already passed
      if (isRequestedDateToday) {
        // Handle both array and string cases for bookingSlots
        const bookingSlotsArray = Array.isArray(booking.bookingSlots)
          ? booking.bookingSlots
          : [booking.bookingSlots];

        // Check if all booking slots have passed
        const allSlotsPassed = bookingSlotsArray.every((slot: string) => {
          const slotHour = parseInt(slot.split(":")[0], 10);
          return slotHour <= currentHour;
        });

        // Skip this booking if all slots have passed
        if (allSlotsPassed) {
          console.log(
            `Filtering out booking ${booking._id} as all slots have passed`
          );
          return false;
        }
      }

      return true;
    })
    .map((booking) => {
      const venueId = booking.venueId.toString();
      const courtId = booking.courtId.toString();
      const venue = venuesMap[venueId];
      const court = courtsMap[courtId];

      // Skip if venue or court not found (should not happen after filtering)
      if (!venue || !court) return null;

      // Calculate distance if venue has location
      let distance = null;
      if (venue.location?.coordinates?.length === 2) {
        const [venueLng, venueLat] = venue.location.coordinates;
        // Haversine formula for distance calculation
        const R = 6371; // Earth radius in km
        const dLat = ((venueLat - latNum) * Math.PI) / 180;
        const dLon = ((venueLng - lngNum) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((latNum * Math.PI) / 180) *
            Math.cos((venueLat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = R * c;

        // Limit to reasonable distance (100 km)
        if (distance > 100) {
          return null; // Skip venues that are too far away
        }
      }

      // For today, filter out booking slots that have already passed
      let filteredBookingSlots: string[] = Array.isArray(booking.bookingSlots)
        ? booking.bookingSlots
        : [booking.bookingSlots];

      if (isRequestedDateToday) {
        filteredBookingSlots = filteredBookingSlots.filter((slot: string) => {
          const slotHour = parseInt(slot.split(":")[0], 10);
          return slotHour > currentHour;
        });
      }

      // Process team1 players
      const team1 = (booking.team1 || []).map((player: any) => {
        const playerId = player.playerId?.toString();
        return {
          playerType: player.playerType,
          player: playerId ? usersMap[playerId] : null,
        };
      });

      // Process team2 players
      const team2 = (booking.team2 || []).map((player: any) => {
        const playerId = player.playerId?.toString();
        return {
          playerType: player.playerType,
          player: playerId ? usersMap[playerId] : null,
        };
      });

      return {
        _id: booking._id,
        bookingDate: booking.bookingDate,
        bookingSlots: filteredBookingSlots,
        askToJoin: booking.askToJoin,
        isCompetitive: booking.isCompetitive,
        skillRequired: booking.skillRequired,
        team1,
        team2,
        venue: {
          _id: venue._id,
          name: venue.name,
          city: venue.city,
          state: venue.state,
          image: venue.image,
          weather: venue.weather,
        },
        court,
        distance: distance !== null ? Math.round(distance * 10) / 10 : null,
      };
    })
    .filter((booking) => booking !== null) as any[];

  // Sort by distance
  processedBookings.sort((a, b) => {
    // Handle null distances (put them at the end)
    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;

    // Sort by distance
    return distance === "ASC"
      ? a.distance - b.distance
      : b.distance - a.distance;
  });

  console.log(`Returning ${processedBookings.length} processed open matches`);

  return {
    success: true,
    message: "Open matches retrieved successfully",
    data: processedBookings,
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
    .populate("venueId", "name city state image")
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

export const searchFriendServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { search, page = "1", limit = "10" } = req.query;

  // Parse pagination parameters
  const pageNumber = parseInt(page as string) || 1;
  const limitNumber = parseInt(limit as string) || 10;
  const offset = (pageNumber - 1) * limitNumber;

  // Get all friendships where the user is involved (excluding blocked)
  const friendships = await friendsModel
    .find({
      $or: [{ userId: userData.id }, { friendId: userData.id }],
      status: { $ne: "blocked" }, // Exclude blocked friendships
    })
    .lean();

  // Get all accepted friendships
  const acceptedFriendships = friendships.filter(
    (f) => f.status === "accepted"
  );

  // Extract friend IDs from accepted friendships
  const friendIds = acceptedFriendships.map((f) =>
    f.userId.toString() === userData.id.toString() ? f.friendId : f.userId
  );

  // Build search query
  const searchQuery: any = {
    _id: { $ne: userData.id }, // Exclude current user
  };

  // Add search term if provided
  if (search) {
    searchQuery.$or = [
      { fullName: { $regex: new RegExp(String(search), "i") } },
      { email: { $regex: new RegExp(String(search), "i") } },
      { phoneNumber: { $regex: new RegExp(String(search), "i") } },
    ];
  }

  // Count total matching users for pagination
  const totalUsers = await usersModel.countDocuments(searchQuery);

  // Get paginated users
  const users = await usersModel
    .find(searchQuery)
    .select("fullName profilePic email")
    .skip(offset)
    .limit(limitNumber)
    .sort({ fullName: 1 }) // Sort by name
    .lean();

  // Map users with simplified friendship status (true/false)
  const usersWithFriendshipStatus = users.map((user) => {
    // Check if this user is in the friendIds array (meaning they're friends)
    const isFriend = friendIds.map(String).includes(user._id.toString());

    return {
      _id: user._id,
      fullName: user.fullName,
      profilePic: user.profilePic,
      email: user.email,
      isFriend, // Simple boolean indicating friendship status
    };
  });

  return {
    success: true,
    message: "Users retrieved successfully",
    data: usersWithFriendshipStatus,
    meta: {
      total: totalUsers,
      hasPreviousPage: pageNumber > 1,
      hasNextPage: offset + limitNumber < totalUsers,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(totalUsers / limitNumber),
    },
  };
};

export const sendRequestServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { friendId } = req.body;

  // Input validation
  if (!friendId) {
    return errorResponseHandler(
      "Friend ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate friendId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(friendId)) {
    return errorResponseHandler(
      "Invalid friend ID format",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Prevent sending request to yourself
  if (userData.id === friendId) {
    return errorResponseHandler(
      "You cannot send a friend request to yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if friend exists
  const friend = await usersModel.findById(friendId);
  if (!friend) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check existing relationship with consistent query pattern
  const existingRelationship = await friendsModel.findOne({
    $or: [
      { userId: userData.id, friendId },
      { userId: friendId, friendId: userData.id },
    ],
  });

  if (existingRelationship) {
    // Use constants for status values to avoid typos
    const STATUS = {
      PENDING: "pending",
      ACCEPTED: "accepted",
      BLOCKED: "blocked",
      REJECTED: "rejected",
    };

    // Provide more specific error messages based on relationship status
    if (existingRelationship.status === STATUS.PENDING) {
      const isRequestSender =
        existingRelationship.userId.toString() === userData.id.toString();
      return errorResponseHandler(
        isRequestSender
          ? "You have already sent a friend request to this user"
          : "This user has already sent you a friend request. Check your notifications to respond.",
        httpStatusCode.BAD_REQUEST,
        res
      );
    } else if (existingRelationship.status === STATUS.ACCEPTED) {
      return errorResponseHandler(
        "You are already friends with this user",
        httpStatusCode.BAD_REQUEST,
        res
      );
    } else if (existingRelationship.status === STATUS.BLOCKED) {
      const isBlocker =
        existingRelationship.userId.toString() === userData.id.toString();
      return errorResponseHandler(
        isBlocker
          ? "You have blocked this user. Unblock them first to send a friend request."
          : "You cannot send a request to this user",
        httpStatusCode.FORBIDDEN,
        res
      );
    } else if (existingRelationship.status === STATUS.REJECTED) {
      // Allow re-sending request if previously rejected
      // Delete the old rejected relationship
      await friendsModel.findByIdAndDelete(existingRelationship._id);
      // Continue to create a new request below
    }
  }

  // Create the friend request with proper error handling
  try {
    const request = await friendsModel.create({
      userId: userData.id,
      friendId,
      status: "pending",
    });

    // Create notification for the recipient
    try {
      await createNotification({
        recipientId: friendId,
        senderId: userData.id,
        type: "FRIEND_REQUEST",
        title: "New Friend Request",
        message: `${
          userData.fullName || userData.email
        } sent you a friend request.`,
        category: "FRIEND",
        referenceId: request._id,
        referenceType: "users",
      });
    } catch (notificationError) {
      console.error("Failed to create notification:", notificationError);
      // Continue execution even if notification fails
    }

    return {
      success: true,
      message: "Friend request sent successfully",
      data: request,
    };
  } catch (error) {
    console.error("Error creating friend request:", error);
    return errorResponseHandler(
      "Failed to send friend request. Please try again.",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const acceptFriendRequestServices = async (
  req: Request,
  res: Response
) => {
  const userData = req.user as any;
  const { requestId, status } = req.body;

  // Input validation with consistent status codes
  if (!requestId) {
    return errorResponseHandler(
      "Request ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate requestId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return errorResponseHandler(
      "Invalid request ID format",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Define valid status values as constants
  const VALID_STATUSES = ["accepted", "rejected", "unfriend"];
  if (!VALID_STATUSES.includes(status)) {
    return errorResponseHandler(
      "Invalid status. Must be either 'accepted', 'rejected', or 'unfriend'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Handle unfriend action separately
  if (status === "unfriend") {
    try {
      // Find the friendship record
      const friendship = await friendsModel.findOne({
        _id: requestId,
        status: "accepted", // Must be an accepted friendship
        $or: [
          { userId: userData.id },
          { friendId: userData.id }
        ]
      });

      if (!friendship) {
        return errorResponseHandler(
          "Friendship not found or already removed",
          httpStatusCode.NOT_FOUND,
          res
        );
      }

      // Delete the friendship
      await friendsModel.findByIdAndDelete(requestId);

      return {
        success: true,
        message: "Friend removed successfully",
        data: { relationshipId: requestId }
      };
    } catch (error) {
      console.error("Error removing friend:", error);
      return errorResponseHandler(
        "Failed to remove friend. Please try again.",
        httpStatusCode.INTERNAL_SERVER_ERROR,
        res
      );
    }
  }

  // Handle accept/reject for pending requests
  try {
    // Find the friend request
    const friendRequest = await friendsModel.findOne({
      _id: requestId,
      friendId: userData.id, // Ensure the request was sent to the current user
      status: "pending",
    });

    if (!friendRequest) {
      return errorResponseHandler(
        "Request not found or already processed",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Update the friend request status with transaction
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Update the friend request status
      const updatedRequest = await friendsModel.findByIdAndUpdate(
        requestId,
        {
          $set: {
            status,
            updatedAt: new Date(),
          },
        },
        { new: true, session }
      );

      // Send notification to the requester if accepted
      if (status === "accepted") {
        try {
          await createNotification({
            recipientId: friendRequest.userId,
            senderId: userData.id,
            type: "FRIEND_REQUEST_ACCEPTED",
            title: "Friend Request Accepted",
            message: `${
              userData.fullName || userData.email
            } accepted your friend request.`,
            category: "FRIEND",
            referenceId: requestId,
            referenceType: "users",
          });
        } catch (notificationError) {
          console.error("Failed to create notification:", notificationError);
          // Continue execution even if notification fails
        }
      }

      await session.commitTransaction();

      return {
        success: true,
        message: `Friend request ${status} successfully`,
        data: updatedRequest,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Error processing friend request:", error);
    return errorResponseHandler(
      "Failed to process friend request. Please try again.",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const blockUserServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { userId } = req.body;

  // Input validation
  if (!userId) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate userId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return errorResponseHandler(
      "Invalid user ID format",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if trying to block yourself
  if (userData.id === userId) {
    return errorResponseHandler(
      "You cannot block yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if user exists
    const user = await usersModel.findById(userId);
    if (!user) {
      return errorResponseHandler(
        "User not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Use a transaction for consistent state
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Find existing relationship
      const existingRelationship = await friendsModel.findOne({
        $or: [
          { userId: userData.id, friendId: userId },
          { userId: userId, friendId: userData.id },
        ],
      });

      let result;

      // If relationship exists
      if (existingRelationship) {
        // If already blocked by current user, unblock by deleting the entry
        if (
          existingRelationship.status === "blocked" &&
          existingRelationship.userId.toString() === userData.id.toString()
        ) {
          await friendsModel.findByIdAndDelete(existingRelationship._id, {
            session,
          });
          result = {
            success: true,
            message: "User unblocked successfully",
          };
        } else {
          // If it's any other relationship status, update to blocked
          const updatedRelationship = await friendsModel.findByIdAndUpdate(
            existingRelationship._id,
            {
              $set: {
                status: "blocked",
                userId: userData.id, // Ensure current user is the blocker
                friendId: userId, // Ensure target user is the blocked
                updatedAt: new Date(),
              },
            },
            { new: true, session }
          );

          result = {
            success: true,
            message: "User blocked successfully",
            data: updatedRelationship,
          };
        }
      } else {
        // If no relationship exists, create a new blocked relationship
        const blockedRelationship = await friendsModel.create(
          [
            {
              userId: userData.id,
              friendId: userId,
              status: "blocked",
            },
          ],
          { session }
        );

        result = {
          success: true,
          message: "User blocked successfully",
          data: blockedRelationship[0],
        };
      }

      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Error blocking/unblocking user:", error);
    return errorResponseHandler(
      "Failed to process block/unblock request. Please try again.",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const getFriendsServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { status } = req.query;

  if (!["friends-requests", "blocked"].includes(status as string)) {
    return errorResponseHandler(
      "Invalid status. Must be either 'friends-requests' or 'blocked'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (status === "blocked") {
    // Get blocked users with their details
    const blockedRelationships = await friendsModel
      .find({
        userId: userData.id,
        status: "blocked",
      })
      .lean();

    // Get the user details for blocked users
    const blockedUserIds = blockedRelationships.map((rel) => rel.friendId);
    const blockedUsers = await usersModel
      .find({
        _id: { $in: blockedUserIds },
      })
      .select("fullName email profilePic")
      .lean();

    // Map user details to relationships
    const blockedWithDetails = blockedRelationships.map((rel) => {
      const userDetails =
        blockedUsers.find(
          (user) => user._id.toString() === rel.friendId.toString()
        ) || {};

      return {
        relationshipId: rel._id,
        blockedUserId: rel.friendId,
        status: rel.status,
        updatedAt: rel.updatedAt,
        ...userDetails,
      };
    });

    return {
      success: true,
      message: "Blocked users retrieved successfully",
      data: blockedWithDetails,
    };
  } else {
    // Get accepted friends
    const friendRelationships = await friendsModel
      .find({
        $or: [
          { userId: userData.id, status: "accepted" },
          { friendId: userData.id, status: "accepted" },
        ],
      })
      .lean();

    // Get friend user IDs
    const friendIds = friendRelationships.map((rel) =>
      rel.userId.toString() === userData.id.toString()
        ? rel.friendId
        : rel.userId
    );

    // Get friend user details
    const friendUsers = await usersModel
      .find({
        _id: { $in: friendIds },
      })
      .select("fullName email profilePic")
      .lean();

    // Map user details to relationships
    const friendsWithDetails = friendRelationships.map((rel) => {
      const friendId =
        rel.userId.toString() === userData.id.toString()
          ? rel.friendId
          : rel.userId;

      const userDetails =
        friendUsers.find(
          (user) => user._id.toString() === friendId.toString()
        ) || {};

      return {
        relationshipId: rel._id,
        friendId: friendId,
        status: rel.status,
        updatedAt: rel.updatedAt,
        ...userDetails,
      };
    });

    // Get pending friend requests received by the current user
    const requestRelationships = await friendsModel
      .find({
        friendId: userData.id, // Current user is the recipient
        status: "pending",
      })
      .lean();

    // Get requester user IDs (users who sent the requests)
    const requesterIds = requestRelationships.map((rel) => rel.userId);

    // Get requester user details
    const requesterUsers = await usersModel
      .find({
        _id: { $in: requesterIds },
      })
      .select("fullName email profilePic")
      .lean();

    // Map user details to relationships
    const requestsWithDetails = requestRelationships.map((rel) => {
      const userDetails =
        requesterUsers.find(
          (user) => user._id.toString() === rel.userId.toString()
        ) || {};

      return {
        relationshipId: rel._id,
        requesterId: rel.userId, // ID of the user who sent the request
        status: rel.status,
        updatedAt: rel.updatedAt,
        ...userDetails,
      };
    });

    return {
      success: true,
      message: "Friends and requests retrieved successfully",
      data: {
        friends: friendsWithDetails,
        requests: requestsWithDetails,
      },
    };
  }
};

export const getFriendsByIdServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { id } = req.params;

  if (!id) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if user exists
  const user = await usersModel.findById(id).select("fullName profilePic").lean();
  
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check friendship status
  const friendship = await friendsModel.findOne({
    $or: [
      { userId: userData.id, friendId: id },
      { userId: id, friendId: userData.id }
    ]
  }).lean();

  // Check if the requested user has blocked the current user
  if (friendship && 
      friendship.status === "blocked" && 
      friendship.userId.toString() === id.toString()) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Determine detailed friendship status
  let friendshipStatus = null;
  let isFriend = false;
  
  if (friendship) {
    if (friendship.status === "accepted") {
      friendshipStatus = "friends";
      isFriend = true;
    } else if (friendship.status === "pending") {
      // Check if current user sent the request or received it
      friendshipStatus = friendship.userId.toString() === userData.id.toString() 
        ? "request_sent" 
        : "request_received";
    } else if (friendship.status === "rejected") {
      friendshipStatus = "rejected";
    } else if (friendship.status === "blocked" && 
               friendship.userId.toString() === userData.id.toString()) {
      friendshipStatus = "blocked_by_me";
    }
  }

  // Add hardcoded stats
  const userWithStats = {
    ...user,
    stats: {
      totalMatches: 0,
      padlelMatches: 0,
      pickleballMatches: 0,
      loyaltyPoints: 0,
      level: 0,
      lastMonthLevel: 0,
      level6MonthsAgo: 0,
      level1YearAgo: 0,
      improvement: 0,
      confidence: "10%",
    },
    friendshipStatus: friendshipStatus,
    isFriend: isFriend,
    relationshipId: friendship ? friendship._id : null
  };

  return {
    success: true,
    message: "User data retrieved successfully",
    data: userWithStats
  };
};
