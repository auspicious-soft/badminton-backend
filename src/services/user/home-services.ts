import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { venueModel } from "src/models/venue/venue-schema";
import { httpStatusCode } from "src/lib/constant";
import { bookingModel } from "src/models/venue/booking-schema";
import { friendsModel } from "src/models/user/friends-schema";
import { usersModel } from "src/models/user/user-schema";
import mongoose from "mongoose";

export const userHomeServices = async (req: Request, res: Response) => {
  let nearbyVenues = [];
  const userData = req.user as any;
  let { nearBy = true, lng: lngQuery = null, lat: latQuery = null } = req.query;
  let lng: number | null = null;
  let lat: number | null = null;

  if (lngQuery && latQuery) {
    lng = Number(lngQuery);
    lat = Number(latQuery)
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
                  { team1: { $elemMatch: { playerId: new mongoose.Types.ObjectId(userData.id), paymentStatus: "Paid" } } },
                  { team2: { $elemMatch: { playerId: new mongoose.Types.ObjectId(userData.id), paymentStatus: "Paid" } } },
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
                  { team1: { $elemMatch: { playerId: new mongoose.Types.ObjectId(userData.id) } } },
                  { team2: { $elemMatch: { playerId: new mongoose.Types.ObjectId(userData.id) } } },
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
  let nearbyVenues = [];
  const { date, distance = "ASC", game = "all", lng: lngQuery = null, lat: latQuery = null } = req.query;
  let lng: number | null = null;
  let lat: number | null = null;

  if (!date || !distance || !game) {
    return errorResponseHandler(
      "Invalid Payload",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (lngQuery && latQuery) {
    lng = Number(lngQuery);
    lat = Number(latQuery)
    const geoNearStage: any = {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distance",
        spherical: true,
        maxDistance: 3000000,
      },
    };

    const matchStage: any = {
      isActive: true,
    };

    if (game !== "all") {
      matchStage.gamesAvailable = { $in: [game] };
    }

    const pipeline: any[] = [
      geoNearStage,
      {
        $match: matchStage,
      },
      {
        $project: {
          name: 1,
          city: 1,
          state: 1,
          image: 1,
          courts: {
            $filter: {
              input: "$courts",
              as: "court",
              cond: { $eq: ["$$court.isActive", true] },
            },
          },
          distance: {
            $round: [{ $divide: ["$distance", 1000] }, 1],
          },
          weather: 1,
        },
      },
      {
        $sort: {
          distance: distance === "ASC" ? 1 : -1,
        },
      },
    ];

    nearbyVenues = await venueModel.aggregate(pipeline);
  }

  return {
    success: true,
    message: "User home data retrieved successfully",
    data: nearbyVenues,
  };
};

export const getCourtsServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { venueId } = req.query;
  if (!venueId)
    return errorResponseHandler(
      "Venue ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const venueData = await venueModel
    .findById(venueId)
    .select("-location -employees ")
    .lean();
  if (!venueData)
    return errorResponseHandler(
      "Venue not found",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const data = venueData;

  return {
    success: true,
    message: "Courts retrieved successfully",
    data: data,
  };
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
  const { search } = req.query;

  if (!search) {
    // Get all friendships where the user is involved (both accepted and pending)
    const friendships = await friendsModel
      .find({
        $or: [{ userId: userData.id }, { friendId: userData.id }],
      })
      .lean();

    // Get all user IDs from friendships
    const userIds = friendships.map((friendship) =>
      friendship.userId.toString() === userData.id.toString()
        ? friendship.friendId
        : friendship.userId
    );

    // Fetch all users' details
    const friendUsers = await usersModel
      .find({ _id: { $in: userIds } })
      .select("fullName profilePic")
      .lean();

    // Map users with their friendship status and request details
    const usersWithStatus = friendUsers.map((user) => {
      const friendship = friendships.find(
        (f) =>
          (f.userId.toString() === user._id.toString() &&
            f.friendId.toString() === userData.id) ||
          (f.userId.toString() === userData.id &&
            f.friendId.toString() === user._id.toString())
      );

      let result: any = {
        _id: user._id,
        fullName: user.fullName,
        profilePic: user.profilePic,
      };

      if (friendship?.status === "pending") {
        if (friendship.friendId.toString() === userData.id.toString()) {
          result.friendshipStatus = "request_received";
          result.requestId = friendship._id;
        } else {
          result.friendshipStatus = "request_sent";
        }
      } else {
        result.friendshipStatus = friendship?.status;
      }

      return result;
    });

    return {
      success: true,
      message: "All connections retrieved successfully",
      data: usersWithStatus,
    };
  }

  // If search term is provided, keep existing search functionality
  const searchQuery = {
    _id: { $ne: userData.id },
    $or: [
      { fullName: { $regex: new RegExp(String(search), "i") } },
      { email: { $regex: new RegExp(String(search), "i") } },
      { phoneNumber: { $regex: new RegExp(String(search), "i") } },
    ],
  };

  const users = await usersModel
    .find(searchQuery)
    .select("fullName profilePic")
    .lean();

  const friendships = await friendsModel
    .find({
      $or: [{ userId: userData.id }, { friendId: userData.id }],
    })
    .lean();

  const usersWithFriendshipStatus = users?.map((user) => {
    const friendship = friendships.find(
      (f) =>
        (f.userId.toString() === user._id.toString() &&
          f.friendId.toString() === userData.id) ||
        (f.userId.toString() === userData.id &&
          f.friendId.toString() === user._id.toString())
    );

    let result: any = {
      _id: user._id,
      fullName: user.fullName,
      profilePic: user.profilePic,
      friendshipStatus: "not_connected",
    };

    if (friendship) {
      if (friendship.status === "pending") {
        if (friendship.userId.toString() === userData.id) {
          result.friendshipStatus = "request_sent";
        } else {
          result.friendshipStatus = "request_received";
          result.requestId = friendship._id;
        }
      } else {
        result.friendshipStatus = friendship.status;
      }
    }

    return result;
  });

  return {
    success: true,
    message: "Users retrieved successfully",
    data: usersWithFriendshipStatus,
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

  const friend = await usersModel.findById(friendId);
  if (!friend) {
    return {
      success: false,
      message: "Friend not found",
    };
  }

  const existingRequest = await friendsModel.findOne({
    $or: [
      { userId: userData.id, friendId },
      { userId: friendId, friendId: userData.id },
    ],
  });
  if (existingRequest) {
    return {
      success: false,
      message: "Request already sent or received",
    };
  }

  const request = await friendsModel.create({
    userId: userData.id,
    friendId,
    status: "pending",
  });

  return {
    success: true,
    message: "Request sent successfully",
    data: request,
  };
};

export const acceptFriendRequestServices = async (
  req: Request,
  res: Response
) => {
  const userData = req.user as any;
  const { requestId } = req.body;

  // Input validation
  if (!requestId) {
    return {
      success: false,
      message: "Request ID is required",
      statusCode: 400,
    };
  }

  // Validate requestId format
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return errorResponseHandler(
      "Invalid request ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find the friend request
  const friendRequest = await friendsModel.findOne({
    _id: requestId,
    friendId: userData.id, // Ensure the request was sent to the current user
    status: "pending",
  });

  if (!friendRequest) {
    return errorResponseHandler(
      "Request not found or already accepted/rejected",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Update the friend request status
  await friendsModel.findByIdAndUpdate(
    requestId,
    {
      $set: {
        status: "accepted",
        updatedAt: new Date(),
      },
    },
    { new: true }
  );

  // You might want to emit a notification event here
  // emitNotification(friendRequest.userId, 'FRIEND_REQUEST_ACCEPTED', {
  //   from: userData.id,
  //   requestId: requestId
  // });

  return {
    success: true,
    message: "Friend request accepted successfully",
  };
};
