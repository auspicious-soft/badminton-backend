import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { bookingModel } from "src/models/venue/booking-schema";
import { gameScoreModel } from "src/models/venue/game-score";
import { object } from "webidl-conversions";
import { getCurrentISTTime } from "../../utils";
import { createNotification } from "src/models/notification/notification-schema";

export const getMyMatches = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;

    const { type, filter } = req.query;
    let response: any = {
      success: true,
      message: "Matches retrieved successfully",
      data: [],
    };

    if (type !== "all" && type !== "current") {
      return errorResponseHandler(
        "Invalid Type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate filter if provided
    if (
      filter &&
      !["upcoming", "current", "previous"].includes(filter as string)
    ) {
      return errorResponseHandler(
        "Invalid Filter. Must be 'upcoming', 'current', or 'previous'",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Get current time in IST
    const currentDate = getCurrentISTTime();

    console.log(`Current IST time: ${currentDate.toISOString()}`);

    if (type === "all") {
      // For all type, get all bookings (previous, current, and upcoming)
      const allBookings = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingPaymentStatus: true,
        })
        .populate({
          path: "venueId",
          select: "name city state address",
        })
        .populate({
          path: "courtId",
          select: "games",
        })
        .sort({ bookingDate: 1 }) // Sort by date ascending
        .lean();

      // Get all player IDs from both teams
      const playerIds = new Set<string>();
      allBookings.forEach((booking) => {
        booking.team1?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
        booking.team2?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
      });

      // Get player data
      const players = await mongoose
        .model("users")
        .find({
          _id: { $in: Array.from(playerIds) },
        })
        .select("_id fullName profilePic")
        .lean();

      // Create a map of players by ID for quick lookup
      const playersMap = players.reduce((map, player: any) => {
        map[player._id.toString()] = player;
        return map;
      }, {} as Record<string, any>);

      // Define date boundaries for categorization
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // Process all bookings to include player data, scores, and status
      const processedBookings = await Promise.all(
        allBookings.map(async (booking) => {
          // Get score for this booking
          const score =
            (await gameScoreModel.findOne({ bookingId: booking._id }).lean()) ||
            {};

          // Process team1 players
          const team1WithPlayerData = (booking.team1 || []).map(
            (player: any) => {
              const playerId = player.playerId?.toString();
              return {
                ...player,
                playerData: playerId ? playersMap[playerId] : null,
              };
            }
          );

          // Process team2 players
          const team2WithPlayerData = (booking.team2 || []).map(
            (player: any) => {
              const playerId = player.playerId?.toString();
              return {
                ...player,
                playerData: playerId ? playersMap[playerId] : null,
              };
            }
          );

          // Determine booking status based on date
          let status = "upcoming";
          const bookingDate = new Date(booking.bookingDate);

          if (bookingDate < today) {
            status = "previous";
          } else if (bookingDate >= today && bookingDate <= endOfToday) {
            status = "current";
          }

          return {
            ...booking,
            team1: team1WithPlayerData,
            team2: team2WithPlayerData,
            score,
            status, // Add status field to each booking
          };
        })
      );

      // Apply filter if provided
      let filteredBookings = processedBookings;
      if (filter) {
        filteredBookings = processedBookings.filter(
          (booking) => booking.status === filter
        );
      }

      // Sort the processed bookings by status priority (current, upcoming, previous)
      const sortedBookings = filteredBookings.sort((a, b) => {
        const statusOrder = { current: 0, upcoming: 1, previous: 2 };
        return (
          statusOrder[a.status as keyof typeof statusOrder] -
          statusOrder[b.status as keyof typeof statusOrder]
        );
      });

      response.data = sortedBookings;
    } else {
      // Keep the existing implementation for type === "current"
      const previous = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingDate: { $lt: new Date() },
        })
        .populate({
          path: "venueId",
          select: "name city state address",
        })
        .populate({
          path: "courtId",
          select: "games",
        })
        .lean();

      const current = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingDate: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        })
        .populate({
          path: "venueId",
          select: "name city state address",
        })
        .populate({
          path: "courtId",
          select: "games",
        })
        .lean();

      // Get all player IDs from both previous and current bookings
      const playerIds = new Set<string>();
      [...previous, ...current].forEach((booking) => {
        booking.team1?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
        booking.team2?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
      });

      // Get player data
      const players = await mongoose
        .model("users")
        .find({
          _id: { $in: Array.from(playerIds) },
        })
        .select("_id fullName profilePic")
        .lean();

      // Create a map of players by ID for quick lookup
      const playersMap = players.reduce((map, player: any) => {
        map[player._id.toString()] = player;
        return map;
      }, {} as Record<string, any>);

      // Process previous bookings
      const processedPrevious = await Promise.all(
        previous.map(async (booking) => {
          // Get score for this booking
          const score =
            (await gameScoreModel.findOne({ bookingId: booking._id }).lean()) ||
            {};

          // Process team1 players
          const team1WithPlayerData = (booking.team1 || []).map(
            (player: any) => {
              const playerId = player.playerId?.toString();
              return {
                ...player,
                playerData: playerId ? playersMap[playerId] : null,
              };
            }
          );

          // Process team2 players
          const team2WithPlayerData = (booking.team2 || []).map(
            (player: any) => {
              const playerId = player.playerId?.toString();
              return {
                ...player,
                playerData: playerId ? playersMap[playerId] : null,
              };
            }
          );

          return {
            ...booking,
            team1: team1WithPlayerData,
            team2: team2WithPlayerData,
            score,
          };
        })
      );

      // Process current bookings
      const processedCurrent = await Promise.all(
        current.map(async (booking) => {
          // Get score for this booking
          const score =
            (await gameScoreModel.findOne({ bookingId: booking._id }).lean()) ||
            {};

          // Process team1 players
          const team1WithPlayerData = (booking.team1 || []).map(
            (player: any) => {
              const playerId = player.playerId?.toString();
              return {
                ...player,
                playerData: playerId ? playersMap[playerId] : null,
              };
            }
          );

          // Process team2 players
          const team2WithPlayerData = (booking.team2 || []).map(
            (player: any) => {
              const playerId = player.playerId?.toString();
              return {
                ...player,
                playerData: playerId ? playersMap[playerId] : null,
              };
            }
          );

          return {
            ...booking,
            team1: team1WithPlayerData,
            team2: team2WithPlayerData,
            score,
          };
        })
      );

      response.data = {
        previous: processedPrevious,
        current: processedCurrent,
      };
    }

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getMatchesById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userData = req.user as any;

    if (!id) {
      return errorResponseHandler(
        "Booking ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const booking = await bookingModel
      .findOne({
        _id: id,
        $or: [
          { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
          { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
        ],
      })
      .populate({
        path: "venueId",
        select: "name city state address",
      })
      .populate({
        path: "courtId",
        select: "games",
      })
      .lean();

    if (!booking) {
      return errorResponseHandler(
        "Booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Get all player IDs from the booking
    const playerIds = new Set<string>();
    booking.team1?.forEach((player: any) => {
      if (player.playerId) playerIds.add(player.playerId.toString());
    });
    booking.team2?.forEach((player: any) => {
      if (player.playerId) playerIds.add(player.playerId.toString());
    });

    // Get player data
    const players = await mongoose
      .model("users")
      .find({
        _id: { $in: Array.from(playerIds) },
      })
      .select("_id fullName profilePic")
      .lean();

    // Create a map of players by ID for quick lookup
    const playersMap = players.reduce((map, player: any) => {
      map[player._id.toString()] = player;
      return map;
    }, {} as Record<string, any>);

    // Process team1 players
    const team1WithPlayerData = (booking.team1 || []).map((player: any) => {
      const playerId = player.playerId?.toString();
      return {
        ...player,
        playerData: playerId ? playersMap[playerId] : null,
      };
    });

    // Process team2 players
    const team2WithPlayerData = (booking.team2 || []).map((player: any) => {
      const playerId = player.playerId?.toString();
      return {
        ...player,
        playerData: playerId ? playersMap[playerId] : null,
      };
    });

    // Get score for this booking
    const score =
      (await gameScoreModel.findOne({ bookingId: booking._id }).lean()) || {};
    const processedBooking = {
      ...booking,
      team1: team1WithPlayerData,
      team2: team2WithPlayerData,
      score,
    };

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Booking retrieved successfully",
      data: processedBooking,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const uploadScore = async (req: Request, res: Response) => {
  try {
    const { bookingId, ...restData } = req.body;

    // Validate bookingId
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return errorResponseHandler(
        "Valid booking ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if booking exists
    const checkExist = await bookingModel.findById(bookingId);
    if (!checkExist) {
      return errorResponseHandler(
        "Booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Validate score data
    if (
      !restData.set1 &&
      !restData.set2 &&
      !restData.set3 &&
      !restData.winner
    ) {
      return errorResponseHandler(
        "At least one set score or winner must be provided",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if score already exists for this booking
    const checkScoreExist = await gameScoreModel.findOne({ bookingId });

    let data;
    let message = "Score uploaded successfully";

    if (checkScoreExist) {
      // Update existing score
      data = await gameScoreModel.findByIdAndUpdate(
        checkScoreExist._id,
        restData,
        { new: true }
      );
      message = "Score updated successfully";
    } else {
      // Create new score
      data = await gameScoreModel.create({ bookingId, ...restData });
    }

    // Create notification for all players in the booking
    const playerIds = new Set<string>();

    // Collect player IDs from both teams
    checkExist.team1?.forEach((player: any) => {
      if (
        player.playerId &&
        player.playerId.toString() !== (req.user as any).id
      ) {
        playerIds.add(player.playerId.toString());
      }
    });

    checkExist.team2?.forEach((player: any) => {
      if (
        player.playerId &&
        player.playerId.toString() !== (req.user as any).id
      ) {
        playerIds.add(player.playerId.toString());
      }
    });

    // Send notifications to all players except the one uploading the score
    // const notificationPromises = Array.from(playerIds).map((playerId) => {
    //   return createNotification({
    //     recipientId: new mongoose.Types.ObjectId(playerId),
    //     senderId: (req.user as any).id,
    //     type: "SCORE_UPDATE",
    //     title: "Match Score Updated",
    //     message: `The score for your match on ${new Date(
    //       checkExist.bookingDate
    //     ).toLocaleDateString()} has been ${
    //       checkScoreExist ? "updated" : "recorded"
    //     }.`,
    //     category: "GAME",
    //     referenceId: bookingId,
    //     referenceType: "bookings",
    //   });
    // });

    // await Promise.all(notificationPromises);

    return res.status(httpStatusCode.OK).json({
      success: true,
      message,
      data,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
