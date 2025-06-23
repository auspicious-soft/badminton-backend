import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { bookingModel } from "src/models/venue/booking-schema";
import { gameScoreModel } from "src/models/venue/game-score";
import { getCurrentISTTime } from "../../utils";
import { transactionModel } from "src/models/admin/transaction-schema";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { courtModel } from "src/models/venue/court-schema";
import { adminSettingModel } from "src/models/admin/admin-settings";
import { notificationModel } from "src/models/notification/notification-schema";
import { notifyUser } from "src/utils/FCM/FCM";

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
    const currentDate = new Date().setHours(0, 0, 0, 0);

    if (type === "all") {
      // For all type, get all bookings (previous, current, and upcoming)
      const allBookings = await bookingModel
        .find({
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
      const today = new Date().setHours(0, 0, 0, 0);
      const endOfToday = new Date().setHours(23, 59, 59, 999);

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
          const bookingDate = new Date(booking.bookingDate).getTime();

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
      const nowIST = getCurrentISTTime();
      const currentISTHour = nowIST.getHours();

      // Normalize today's date in IST
      const todayStartIST = new Date(nowIST);
      todayStartIST.setHours(0, 0, 0, 0);

      const todayEndIST = new Date(nowIST);
      todayEndIST.setHours(23, 59, 59, 999);
      // Keep the existing implementation for type === "current"
      const todayBookings = await bookingModel
        .find({
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
          bookingDate: {
            $gte: todayStartIST,
            $lte: todayEndIST,
          },
        })
        .populate("venueId", "name city state address")
        .populate("courtId", "games")
        .lean();

      // Split into current and previous using slot hour comparison
      const current: any[] = [];
      const currentPrevious: any[] = [];

      for (const booking of todayBookings) {
        const slotHour = parseInt(booking.bookingSlots.split(":")[0], 10);
        if (slotHour >= currentISTHour) {
          current.push(booking);
        } else {
          currentPrevious.push(booking);
        }
      }

      // Fetch all previous day bookings
      const previousDaysBookings = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingDate: { $lt: todayStartIST }, // strictly before today
        })
        .populate("venueId", "name city state address")
        .populate("courtId", "games")
        .lean();

      // Combine with today’s past-hour slots for full "previous"
      const previous = [...previousDaysBookings, ...currentPrevious];

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
      data = await gameScoreModel.create({ bookingId, ...restData });

      const settings = await adminSettingModel
        .findOne({ isActive: true })
        .lean();

      const freeGameAfter =
        (settings?.loyaltyPoints?.limit || 2000) /
        (settings?.loyaltyPoints?.perMatch || 200);

      const milestone = Array.from(
        { length: 30 },
        (_, index) => (index + 1) * freeGameAfter
      );

      const { player_A1, player_A2, player_B1, player_B2 } = restData;
      const inc = settings?.loyaltyPoints?.perMatch || 200;

      const countGames = async (id: any) => {
        // Fixed: Corrected the updateOne syntax and added proper error handling
        const points = await additionalUserInfoModel.findOneAndUpdate(
          { userId: id },
          { $inc: { loyaltyPoints: inc } },
          { new: true, upsert: true }
        );

        // Fixed: Check if points reached the limit after increment
        if (
          points &&
          points.loyaltyPoints >= (settings?.loyaltyPoints?.limit || 2000)
        ) {
          await additionalUserInfoModel.updateOne(
            { userId: id },
            {
              $inc: { freeGameCount: 1 },
              $set: { loyaltyPoints: 0 },
            }
          );

          await notifyUser({
            recipientId: id,
            type: "FREE_GAME_EARNED",
            title: "Congrats! You have earned a free game",
            message: `You have earned a free game after successfully completing milestone of ${freeGameAfter} games`,
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
