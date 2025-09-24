import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { bookingModel } from "src/models/venue/booking-schema";
import { gameScoreModel } from "src/models/venue/game-score";
import { getCurrentISTTime, getWinnerTeam } from "../../utils";
import { transactionModel } from "src/models/admin/transaction-schema";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { courtModel } from "src/models/venue/court-schema";
import { adminSettingModel } from "src/models/admin/admin-settings";
import { notificationModel } from "src/models/notification/notification-schema";
import { notifyUser } from "src/utils/FCM/FCM";
import { chatModel } from "src/models/chat/chat-schema";

export const getMyMatches = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const { type, page = 1, limit = 10 } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (type !== "all" && type !== "upcoming" && type !== "previous") {
      return errorResponseHandler(
        "Invalid Type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const currentDate = new Date().toISOString();

    const baseMatchFilter: any = {
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
      bookingPaymentStatus: true,
    };

    if (type === "upcoming") {
      baseMatchFilter.bookingDate = { $gte: currentDate };
    } else if (type === "previous") {
      baseMatchFilter.bookingDate = { $lt: currentDate };
    }

    const totalCount = await bookingModel.countDocuments(baseMatchFilter);

    const bookings = await bookingModel
      .find(baseMatchFilter)
      .populate("venueId", "name city state address image")
      .populate("courtId", "games name image")
      .sort({ bookingDate: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean();

    // Collect all player IDs
    const playerIds = new Set<string>();
    bookings.forEach((booking) => {
      booking.team1?.forEach((player: any) => {
        if (player.playerId) playerIds.add(player.playerId.toString());
      });
      booking.team2?.forEach((player: any) => {
        if (player.playerId) playerIds.add(player.playerId.toString());
      });
    });

    const players = await mongoose
      .model("users")
      .find({ _id: { $in: Array.from(playerIds) } })
      .select("_id fullName profilePic")
      .lean();

    const playersMap = players.reduce((map, player: any) => {
      map[player._id.toString()] = player;
      return map;
    }, {} as Record<string, any>);

    const processedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const score =
          (await gameScoreModel.findOne({ bookingId: booking._id }).lean()) ||
          {};

        const team1WithPlayerData = (booking.team1 || []).map((player: any) => {
          const playerId = player.playerId?.toString();
          return {
            ...player,
            playerId: playerId ?? "",
            rackets: player.rackets ?? 0,
            balls: player.balls ?? 0,
            playerData: playerId ? playersMap[playerId] : null,
          };
        });

        const team2WithPlayerData = (booking.team2 || []).map((player: any) => {
          const playerId = player.playerId?.toString();
          return {
            ...player,
            playerId: playerId ?? "",
            rackets: player.rackets ?? 0,
            balls: player.balls ?? 0,
            playerData: playerId ? playersMap[playerId] : null,
          };
        });

        const status =
          booking.bookingDate.toISOString() < currentDate
            ? "previous"
            : "upcoming";

        return {
          ...booking,
          team1: team1WithPlayerData,
          team2: team2WithPlayerData,
          score,
          status,
        };
      })
    );

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Matches retrieved successfully",
      data: processedBookings,
      pagination: {
        totalCount,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        limit: limitNumber,
        hasNextPage: pageNumber * limitNumber < totalCount,
        hasPrevPage: pageNumber > 1,
      },
    });
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
      })
      .populate({
        path: "venueId",
        select: "name city state address image",
      })
      .populate({
        path: "courtId",
        select: "games name image",
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

    let rentedBalls = 0;
    let rendedRackets = 0;

    [...team1WithPlayerData, ...team2WithPlayerData]?.map((data: any) => {
      if (data && data?.balls) {
        rentedBalls = rentedBalls + data.balls;
      }
      if (data && data?.rackets) {
        rendedRackets = rendedRackets + data.rackets;
      }
    });

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Booking retrieved successfully",
      data: {
        ...processedBooking,
        balls: rentedBalls,
        rackets: rendedRackets,
      },
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

    console.log(restData);

    // Validate bookingId
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return errorResponseHandler(
        "Valid booking ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if booking exists
    let checkExist = await bookingModel.findById(bookingId).lean();
    if (!checkExist) {
      return errorResponseHandler(
        "Booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // let checkExist;

    if (checkExist.team2.length == 0) {
      checkExist = await bookingModel.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            team2: [
              {
                playerId: checkExist.team1[1].playerId,
                rackets: checkExist.team1[1].rackets ?? 0,
                balls: checkExist.team1[1].balls ?? 0,
                transactionId: checkExist.team1[1].transactionId,
                paymentStatus: checkExist.team1[1].paymentStatus,
                paidBy: checkExist.team1[1].paidBy,
                playerType: "player3",
              },
            ],
            team1: [
              {
                playerId: checkExist.team1[0].playerId,
                rackets: checkExist.team1[0].rackets ?? 0,
                balls: checkExist.team1[0].balls ?? 0,
                transactionId: checkExist.team1[0].transactionId,
                paymentStatus: checkExist.team1[0].paymentStatus,
                paidBy: checkExist.team1[0].paidBy,
                playerType: "player1",
              },
            ],
          },
        },
        { new: true }
      );
    }

    if (!checkExist) {
      return errorResponseHandler(
        "Booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Validate score data
    if (!restData.set1 && !restData.set2 && !restData.set3) {
      return errorResponseHandler(
        "At least one set score or winner must be provided",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if score already exists for this booking
    const checkScoreExist = await gameScoreModel.findOne({ bookingId });

    const winner = getWinnerTeam(restData.gameType as any, restData) as any;

    let data;
    let message = "Score uploaded successfully";

    if (checkScoreExist) {
      // Update existing score
      data = await gameScoreModel.findByIdAndUpdate(
        checkScoreExist._id,
        { winner, ...restData },
        { new: true }
      );
      message = "Score updated successfully";
    } else {
      const courtData = await courtModel.findById(checkExist.courtId);
      restData.gameType = courtData?.games || "Padel"; // Default to Padel if not specified
      restData.weight = checkExist.isCompetitive ? 0.75 : 0.5; // Default weight for the game
      restData.player_A1 = checkExist.team1[0]?.playerId || null;
      restData.player_A2 = checkExist.team1[1]?.playerId || null;
      restData.player_B1 = checkExist.team2[0]?.playerId || null;
      restData.player_B2 = checkExist.team2[1]?.playerId || null;
      restData.matchType = checkExist.isCompetitive
        ? "Competitive"
        : "Friendly";
      // Create new score
      data = await gameScoreModel.create({ bookingId, winner, ...restData });

      const settings = await adminSettingModel
        .findOne({ isActive: true })
        .lean();

      const freeGameAfter =
        (settings?.loyaltyPoints?.limit || 2000) /
        (settings?.loyaltyPoints?.perMatch || 200);

      const { player_A1, player_A2, player_B1, player_B2 } = restData;
      const inc = settings?.loyaltyPoints?.perMatch || 200;

      await chatModel.deleteOne({ bookingId: bookingId });

      const countGames = async (id: any) => {
        // Fixed: Corrected the updateOne syntax and added proper error handling
        const points = await additionalUserInfoModel.findOneAndUpdate(
          { userId: id },
          {
            $inc: {
              [courtData?.games === "Padel"
                ? "padelLoyalty"
                : "pickleballLoyalty"]: inc,
            },
          },
          { new: true, upsert: true }
        );

        // Fixed: Check if points reached the limit after increment
        if (
          points &&
          points[
            courtData?.games === "Padel" ? "padelLoyalty" : "pickleballLoyalty"
          ] >= (settings?.loyaltyPoints?.limit || 2000)
        ) {
          //25% of last 10 game bookings
          const last10Bookings = await gameScoreModel
            .find(
              {
                $or: [
                  { player_A1: id },
                  { player_A2: id },
                  { player_B1: id },
                  { player_B2: id },
                ],
                gameType: courtData?.games,
              },
              {},
              { sort: { createdAt: -1 }, limit: 10 }
            )
            .populate("bookingId", "bookingAmount")
            .lean();

          const totalAmount = last10Bookings.reduce((sum, game) => {
            const bookingAmount = (game.bookingId as any)?.bookingAmount || 0;
            return sum + bookingAmount;
          }, 0);

          const rewardAmount = (totalAmount / freeGameAfter) * 0.25;

          await additionalUserInfoModel.updateOne(
            { userId: id },
            {
              $inc: {
                playCoins: Math.round(rewardAmount),
                earnedPadel: courtData?.games === "Padel" ? Math.round(rewardAmount) : 0,
                earnedPickleball: courtData?.games === "Pickleball" ? Math.round(rewardAmount) : 0,
              },
              $set: {
                [courtData?.games === "Padel"
                  ? "padelLoyalty"
                  : "pickleballLoyalty"]: 0,
              },
            }
          );

          await notifyUser({
            recipientId: id,
            type: "REFUND_COMPLETED",
            title: "Congrats! You have earned milestone reward",
            message: `You have earned ${Math.round(
              rewardAmount
            )} playcoins on successful completion of ${freeGameAfter} ${
              courtData?.games
            } games`,
            category: "SYSTEM",
            notificationType: "BOTH",
            referenceId: bookingId,
            priority: "HIGH",
            referenceType: "bookings",
            metadata: {
              bookingId: bookingId,
              timestamp: new Date().toISOString(),
            },
          });
        }
      };

      // Process loyalty points for all players
      if (player_A1) {
        await countGames(player_A1);
      }

      if (player_A2) {
        await countGames(player_A2);
      }

      if (player_B1) {
        await countGames(player_B1);
      }

      if (player_B2) {
        await countGames(player_B2);
      }
    }

    if (!data) {
      return errorResponseHandler(
        "Failed to upload score",
        httpStatusCode.INTERNAL_SERVER_ERROR,
        res
      );
    }

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

export const getMyTransactions = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get user's playcoins balance
    const userInfo = await additionalUserInfoModel
      .findOne({ userId: userData.id })
      .lean();

    const playCoinsBalance = userInfo?.playCoins || 0;

    // Get total matches played by the user
    const totalMatches = await bookingModel.countDocuments({
      $or: [
        { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
        { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
      ],
      bookingPaymentStatus: true,
    });

    // Get transaction history with method and transaction type
    const transactions = await transactionModel
      .find({
        userId: userData.id,
        isWebhookVerified: true,
      })
      .select(
        "amount method status playcoinsUsed createdAt notes razorpayAmount text"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string))
      .lean();

    // Process transactions to add transaction type (received/deducted) and payment breakdown
    const transactionHistory = transactions.map((transaction) => {
      // Calculate total amount (amount paid + playcoins used)
      const moneyAmount = transaction.amount - transaction.playcoinsUsed;
      const playcoinsUsed = transaction.playcoinsUsed || 0;
      const totalAmount = moneyAmount + playcoinsUsed;

      // Determine payment method
      let paymentMethod = transaction.method || "razorpay";
      if (playcoinsUsed > 0 && moneyAmount > 0) {
        paymentMethod = "both"; // Both playcoins and money were used
      } else if (playcoinsUsed > 0 && moneyAmount === 0) {
        paymentMethod = "playcoins"; // Only playcoins were used
      }

      return {
        ...transaction,
        transactionType:
          transaction.status === "refunded" || transaction.status === "received"
            ? "received"
            : "deducted",
        paymentMethod: paymentMethod,
        paymentBreakdown: {
          totalAmount: totalAmount,
          moneyPaid: moneyAmount,
          playcoinsUsed: playcoinsUsed,
        },
      };
    });

    const totalTransactions = await transactionModel.countDocuments({
      userId: userData.id,
    });

    const response = {
      success: true,
      message: "Transactions retrieved successfully",
      data: {
        totalPlayCoinsBalance: playCoinsBalance,
        totalMatches: totalMatches,
        transactionHistory: transactionHistory,
      },
      meta: {
        total: totalTransactions,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalTransactions / parseInt(limit as string)),
        hasNextPage: skip + parseInt(limit as string) < totalTransactions,
        hasPreviousPage: skip > 0,
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
