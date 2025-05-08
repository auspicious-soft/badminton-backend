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
    const geoNearStage: any = {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distance",
        spherical: true,
      },
    };

    if (nearBy !== "false") {
      geoNearStage.$geoNear.maxDistance = 30000;
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

    const venues = await venueModel.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lngNum, latNum] },
          distanceField: "distance",
          spherical: true,
          maxDistance: 30000000,
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
  const { date, distance, game, location } = req.body;

  if (!date || !distance || !game || !location?.coordinates?.length) {
    return errorResponseHandler(
      "Invalid Payload",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const [lng, lat] = location.coordinates;

  const pipeline: any[] = [
    // Initial match for public games
    {
      $match: {
        askToJoin: true,
        bookingDate: { $gte: new Date(date) },
      },
    },
    // Lookup venue details
    {
      $lookup: {
        from: "venues",
        localField: "venueId",
        foreignField: "_id",
        as: "venue",
      },
    },
    { $unwind: "$venue" },
    // Match active venues
    {
      $match: {
        "venue.isActive": true,
      },
    },
    // Match the specific court's game type
    {
      $addFields: {
        matchingCourt: {
          $filter: {
            input: "$venue.courts",
            as: "court",
            cond: {
              $and: [
                { $eq: ["$$court._id", "$courtId"] },
                { $eq: ["$$court.isActive", true] },
                ...(game !== "all" ? [{ $eq: ["$$court.games", game] }] : []),
              ],
            },
          },
        },
      },
    },
    // Only keep bookings where we found a matching court
    {
      $match: {
        "matchingCourt.0": { $exists: true },
      },
    },
    // Calculate distance
    {
      $addFields: {
        venueLocation: "$venue.location",
        distance: {
          $cond: {
            if: { $eq: ["$venue.location.coordinates", [0, 0]] },
            then: null,
            else: {
              $divide: [
                {
                  $multiply: [
                    6371,
                    {
                      $acos: {
                        $add: [
                          {
                            $multiply: [
                              { $sin: { $degreesToRadians: lat } },
                              {
                                $sin: {
                                  $degreesToRadians: {
                                    $arrayElemAt: [
                                      "$venue.location.coordinates",
                                      1,
                                    ],
                                  },
                                },
                              },
                            ],
                          },
                          {
                            $multiply: [
                              { $cos: { $degreesToRadians: lat } },
                              {
                                $cos: {
                                  $degreesToRadians: {
                                    $arrayElemAt: [
                                      "$venue.location.coordinates",
                                      1,
                                    ],
                                  },
                                },
                              },
                              {
                                $cos: {
                                  $subtract: [
                                    {
                                      $degreesToRadians: {
                                        $arrayElemAt: [
                                          "$venue.location.coordinates",
                                          0,
                                        ],
                                      },
                                    },
                                    { $degreesToRadians: lng },
                                  ],
                                },
                              },
                            ],
                          },
                        ],
                      },
                    },
                  ],
                },
                1,
              ],
            },
          },
        },
      },
    },
    // Filter by distance
    {
      $match: {
        $or: [{ distance: { $lte: 3000 } }, { distance: null }],
      },
    },
    // Add lookup for team1 players with specific fields
    {
      $lookup: {
        from: "users",
        let: {
          team1PlayerIds: {
            $map: {
              input: "$team1",
              as: "player",
              in: "$$player.playerId",
            },
          },
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$_id", "$$team1PlayerIds"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: "$fullName", // Assuming the field is fullName in users collection
              image: "$profilePic", // Assuming the field is profilePic in users collection
            },
          },
        ],
        as: "team1Players",
      },
    },
    // Add lookup for team2 players with specific fields
    {
      $lookup: {
        from: "users",
        let: {
          team2PlayerIds: {
            $map: {
              input: "$team2",
              as: "player",
              in: "$$player.playerId",
            },
          },
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$_id", "$$team2PlayerIds"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: "$fullName",
              image: "$profilePic",
            },
          },
        ],
        as: "team2Players",
      },
    },
    // Final projection
    {
      $project: {
        bookingDate: 1,
        bookingSlots: 1,
        askToJoin: 1,
        isCompetitive: 1,
        skillRequired: 1,
        team1: {
          $map: {
            input: "$team1",
            as: "player",
            in: {
              playerType: "$$player.playerType",
              player: {
                $let: {
                  vars: {
                    matchedPlayer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$team1Players",
                            cond: { $eq: ["$$this._id", "$$player.playerId"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: "$$matchedPlayer",
                },
              },
            },
          },
        },
        team2: {
          $map: {
            input: "$team2",
            as: "player",
            in: {
              playerType: "$$player.playerType",
              player: {
                $let: {
                  vars: {
                    matchedPlayer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$team2Players",
                            cond: { $eq: ["$$this._id", "$$player.playerId"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: "$$matchedPlayer",
                },
              },
            },
          },
        },
        venue: {
          _id: "$venue._id",
          name: "$venue.name",
          city: "$venue.city",
          state: "$venue.state",
          image: "$venue.image",
          weather: "$venue.weather",
          court: { $arrayElemAt: ["$matchingCourt", 0] },
        },
        distance: { $round: ["$distance", 1] },
      },
    },
    // Sort by distance and date
    {
      $sort: {
        distance: distance === "ASC" ? 1 : -1,
        bookingDate: 1,
      },
    },
  ];

  const openMatches = await bookingModel.aggregate(pipeline);

  return {
    success: true,
    message: "Open matches retrieved successfully",
    data: openMatches,
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

  if (!friendId) {
    return {
      success: false,
      message: "Friend ID is required",
    };
  }

  // Prevent sending request to yourself
  if (userData.id === friendId) {
    return {
      success: false,
      message: "You cannot send a friend request to yourself",
    };
  }

  const friend = await usersModel.findById(friendId);
  if (!friend) {
    return {
      success: false,
      message: "User not found",
    };
  }

  const existingRelationship = await friendsModel.findOne({
    $or: [
      { userId: userData.id, friendId },
      { userId: friendId, friendId: userData.id },
    ],
  });

  if (existingRelationship) {
    // Provide more specific error messages based on relationship status
    if (existingRelationship.status === "pending") {
      return {
        success: false,
        message:
          existingRelationship.userId.toString() === userData.id.toString()
            ? "You have already sent a friend request to this user"
            : "This user has already sent you a friend request",
      };
    } else if (existingRelationship.status === "accepted") {
      return {
        success: false,
        message: "You are already friends with this user",
      };
    } else if (existingRelationship.status === "blocked") {
      return {
        success: false,
        message:
          existingRelationship.userId.toString() === userData.id.toString()
            ? "You have blocked this user"
            : "You cannot send a request to this user",
      };
    }
  }

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
      category: "FRIEND", // Changed from SOCIAL to FRIEND
      referenceId: request._id,
      referenceType: "users", // Changed from friends to users
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
    // Continue execution even if notification fails
  }

  return {
    success: true,
    message: "Friend request sent successfully",
    data: request,
  };
};

export const acceptFriendRequestServices = async (
  req: Request,
  res: Response
) => {
  const userData = req.user as any;
  const { requestId, status } = req.body;

  // Input validation
  if (!requestId) {
    return {
      success: false,
      message: "Request ID is required",
      statusCode: 400,
    };
  }

  if (!["accepted", "rejected"].includes(status)) {
    return {
      success: false,
      message: "Invalid status. Must be either 'accepted' or 'rejected'",
      statusCode: 400,
    };
  }

  // Find the friend request
  const friendRequest = await friendsModel.findOne({
    _id: requestId,
    friendId: userData.id, // Ensure the request was sent to the current user
    status: "pending",
  });

  if (!friendRequest) {
    return {
      success: false,
      message: "Request not found or already processed",
      statusCode: 404,
    };
  }

  // Update the friend request status
  const updatedRequest = await friendsModel.findByIdAndUpdate(
    requestId,
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    },
    { new: true }
  );

  // Send notification to the requester
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
        category: "FRIEND", // Changed from SOCIAL to FRIEND
        referenceId: requestId,
        referenceType: "users", // Changed from friends to users
      });
    } catch (error) {
      console.error("Failed to create notification:", error);
      // Continue execution even if notification fails
    }
  }

  return {
    success: true,
    message: `Friend request ${status} successfully`,
    data: updatedRequest,
  };
};

export const blockUserServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { userId } = req.body;

  if (!userId) {
    return {
      success: false,
      message: "User ID is required",
    };
  }

  // Check if user exists
  const user = await usersModel.findById(userId);
  if (!user) {
    return {
      success: false,
      message: "User not found",
    };
  }

  // Check if trying to block yourself
  if (userData.id === userId) {
    return {
      success: false,
      message: "You cannot block yourself",
    };
  }

  // Find existing relationship
  const existingRelationship = await friendsModel.findOne({
    $or: [
      { userId: userData.id, friendId: userId },
      { userId: userId, friendId: userData.id },
    ],
  });

  // If relationship exists
  if (existingRelationship) {
    // If already blocked by current user, unblock by deleting the entry
    if (
      existingRelationship.status === "blocked" &&
      existingRelationship.userId.toString() === userData.id.toString()
    ) {
      await friendsModel.findByIdAndDelete(existingRelationship._id);
      return {
        success: true,
        message: "User unblocked successfully",
      };
    }

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
      { new: true }
    );

    return {
      success: true,
      message: "User blocked successfully",
      data: updatedRelationship,
    };
  }

  // If no relationship exists, create a new blocked relationship
  const blockedRelationship = await friendsModel.create({
    userId: userData.id,
    friendId: userId,
    status: "blocked",
  });

  return {
    success: true,
    message: "User blocked successfully",
    data: blockedRelationship,
  };
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
