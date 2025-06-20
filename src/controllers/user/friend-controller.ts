import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { createNotification } from "src/models/notification/notification-schema";
import { friendsModel } from "src/models/user/friends-schema";
import { usersModel } from "src/models/user/user-schema";
import { bookingModel } from "src/models/venue/booking-schema";
import { gameScoreModel } from "src/models/venue/game-score";
import { getCurrentISTTime } from "src/utils";
import { notifyUser } from "src/utils/FCM/FCM";

export const searchFriend = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
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

    const response = {
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
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const sendRequest = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
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

      // Handle different relationship statuses
      if (existingRelationship.status === STATUS.PENDING) {
        const isRequestSender =
          existingRelationship.userId.toString() === userData.id.toString();

        if (isRequestSender) {
          // If current user sent the request, cancel it by deleting
          await friendsModel.findByIdAndDelete(existingRelationship._id);
          return res.status(httpStatusCode.OK).json({
            success: true,
            message: "Friend request canceled successfully",
            data: { relationshipId: existingRelationship._id },
          });
        } else {
          // If the other user sent the request
          return errorResponseHandler(
            "This user has already sent you a friend request. Check your notifications to respond.",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
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
        await notifyUser({
          recipientId: friendId,
          type: "FRIEND_REQUEST",
          title: "New Friend Request",
          message: `${
            userData.name || userData.email
          } sent you a friend request.`,
          category: "FRIEND",
          metadata: {
            friendId: userData.id,
          },
          notificationType: "BOTH", // Send both push and in-app notifications
          referenceId: userData.id,
          referenceType: "users",
        });
      } catch (notificationError) {
        console.error("Failed to create notification:", notificationError);
        // Continue execution even if notification fails
      }
      return res.status(httpStatusCode.OK).json({
        success: true,
        message: "Friend request sent successfully",
        data: request,
      });
    } catch (error) {
      console.error("Error creating friend request:", error);
      return errorResponseHandler(
        "Failed to send friend request. Please try again.",
        httpStatusCode.INTERNAL_SERVER_ERROR,
        res
      );
    }
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const acceptFriendRequest = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
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
          $or: [{ userId: userData.id }, { friendId: userData.id }],
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
        return res.status(httpStatusCode.OK).json({
          success: true,
          message: "Friend removed successfully",
          data: { relationshipId: requestId },
        });
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
            await notifyUser({
              recipientId: (updatedRequest as any).userId,
              type: "FRIEND_REQUEST_ACCEPTED",
              title: "Friend Request Accepted",
              message: `${
                userData.name || userData.email
              } accepted your friend request.`,
              category: "FRIEND",
              metadata: {
                friendId: userData.id,
              },
              notificationType: "BOTH", // Send both push and in-app notifications
              referenceId: (updatedRequest as any)._id,
              referenceType: "users",
            });
          } catch (notificationError) {
            console.error("Failed to create notification:", notificationError);
            // Continue execution even if notification fails
          }
        }

        await session.commitTransaction();
        return res.status(httpStatusCode.OK).json({
          success: true,
          message: `Friend request ${status} successfully`,
          data: updatedRequest,
        });
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
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const blockUser = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
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
        return res.status(httpStatusCode.OK).json(result);
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
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getFriends = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const { status, search } = req.query;

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
        .select("fullName email profilePic phoneNumber")
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

      return res.status(httpStatusCode.OK).json({
        success: true,
        message: "Blocked users retrieved successfully",
        data: blockedWithDetails,
      });
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
        .select("fullName email profilePic phoneNumber")
        .lean();

      // Map user details to relationships
      let friendsWithDetails = friendRelationships.map((rel) => {
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

      // Apply search filter to friends if search parameter is provided
      if (search) {
        const searchTerm = String(search).toLowerCase();
        friendsWithDetails = friendsWithDetails.filter((friend: any) => {
          return (
            (friend.fullName &&
              typeof friend.fullName === "string" &&
              friend.fullName.toLowerCase().includes(searchTerm)) ||
            (friend.email &&
              typeof friend.email === "string" &&
              friend.email.toLowerCase().includes(searchTerm)) ||
            (friend.phoneNumber &&
              typeof friend.phoneNumber === "string" &&
              friend.phoneNumber.includes(searchTerm))
          );
        });
      }

      // Get pending friend requests received by the current user
      // Requests are not affected by search parameter
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
        .select("fullName email profilePic phoneNumber")
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

      const response = {
        success: true,
        message: "Friends and requests retrieved successfully",
        data: {
          friends: friendsWithDetails,
          requests: requestsWithDetails,
        },
      };
      return res.status(httpStatusCode.OK).json(response);
    }
  } catch (error: any) {
    console.error("Get friends error:", error);
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getFriendsById = async (req: Request, res: Response) => {
  try {
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
    const user = await usersModel
      .findById(id)
      .select("fullName profilePic")
      .lean();

    if (!user) {
      return errorResponseHandler(
        "User not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check friendship status
    const friendship = await friendsModel
      .findOne({
        $or: [
          { userId: userData.id, friendId: id },
          { userId: id, friendId: userData.id },
        ],
      })
      .lean();

    // Check if the requested user has blocked the current user
    if (
      friendship &&
      friendship.status === "blocked" &&
      friendship.userId.toString() === id.toString()
    ) {
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
        friendshipStatus =
          friendship.userId.toString() === userData.id.toString()
            ? "request_sent"
            : "request_received";
      } else if (friendship.status === "rejected") {
        friendshipStatus = "rejected";
      } else if (
        friendship.status === "blocked" &&
        friendship.userId.toString() === userData.id.toString()
      ) {
        friendshipStatus = "blocked_by_me";
      }
    }

    const currentDate = new Date().setHours(0, 0, 0, 0); // Normalize to start of the day
    const currentISTHour = getCurrentISTTime().getHours();
    const endOfToday = new Date().setHours(23,59,59,999)

    // Get previous matches played by the user
    const previousMatches = (await bookingModel
      .find({
        $and: [
          // Player condition - must be in either team1 or team2
          {
            $or: [
              { "team1.playerId": new mongoose.Types.ObjectId(id) },
              { "team2.playerId": new mongoose.Types.ObjectId(id) },
            ],
          },
          // Date/time condition - booking must be completed
          {
            $or: [
              {
                // Case 1: Any booking from before today (fully completed)
                bookingDate: { $lt: currentDate },
              },
              {
                // Case 2: Today's booking, but time has passed
                bookingDate: {$gte: currentDate, $lte: endOfToday},
                bookingSlots: { $lt: currentISTHour },
              },
            ],
          },
        ],
      })
      .populate({
        path: "venueId",
        select: "name address city state",
      })
      .populate({
        path: "courtId",
        select: "name games",
      })
      .sort({ bookingDate: -1 })
      .lean()) as any[];

    // Get all player IDs from the matches
    const playerIds = new Set<string>();
    previousMatches.forEach((match) => {
      match.team1?.forEach((player: any) => {
        if (player.playerId) playerIds.add(player.playerId.toString());
      });
      match.team2?.forEach((player: any) => {
        if (player.playerId) playerIds.add(player.playerId.toString());
      });
    });

    // Get player details
    const players = await usersModel
      .find({ _id: { $in: Array.from(playerIds) } })
      .select("_id fullName profilePic")
      .lean();

    // Create a map for quick player lookup
    const playerMap = players.reduce((map, player: any) => {
      map[player._id.toString()] = player;
      return map;
    }, {} as Record<string, any>);

    // Get scores for all matches
    const matchIds = previousMatches.map((match) => match._id);
    const scores = await gameScoreModel
      .find({ bookingId: { $in: matchIds } })
      .lean();

    // Create a map for quick score lookup
    const scoreMap = scores.reduce((map, score: any) => {
      map[score.bookingId.toString()] = score;
      return map;
    }, {} as Record<string, any>);

    // Process matches with player details and scores
    const processedMatches = previousMatches.map((match) => {
      // Process team1 players
      const team1WithDetails = (match.team1 || []).map((player: any) => {
        const playerId = player.playerId?.toString();
        return {
          ...player,
          playerData: playerId ? playerMap[playerId] : null,
        };
      });

      // Process team2 players
      const team2WithDetails = (match.team2 || []).map((player: any) => {
        const playerId = player.playerId?.toString();
        return {
          ...player,
          playerData: playerId ? playerMap[playerId] : null,
        };
      });

      // Get score for this match
      const matchScore = scoreMap[match._id.toString()] || {};

      return {
        matchId: match._id,
        date: match.bookingDate,
        time: match.bookingSlots,
        venue: match.venueId,
        court: match.courtId,
        matchType: match.courtId?.games || "Unknown",
        team1: team1WithDetails,
        team2: team2WithDetails,
        score: matchScore,
        isCompetitive: match.isCompetitive || false,
      };
    });

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
      relationshipId: friendship ? friendship._id : null,
      previousMatches: processedMatches,
    };

    const response = {
      success: true,
      message: "User data retrieved successfully",
      data: userWithStats,
    };

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
