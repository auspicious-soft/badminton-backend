import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { bookingModel } from "../../models/venue/booking-schema";
import { bookingRequestModel } from "../../models/venue/booking-request-schema";
import { transactionModel } from "src/models/admin/transaction-schema";
import mongoose from "mongoose";
import {
  createNotification,
  notificationModel,
} from "src/models/notification/notification-schema";
import { priceModel } from "src/models/admin/price-schema";
import razorpayInstance from "src/config/razorpay";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { chatModel } from "src/models/chat/chat-schema";
import { usersModel } from "src/models/user/user-schema";
import { notifyUser } from "src/utils/FCM/FCM";
import { venueModel } from "src/models/venue/venue-schema";
import { fillAndStroke } from "pdfkit";
import { sendInvoiceToUser } from "src/utils";

function makeBookingDateInIST(rawDate: any, slotHour: any) {
  const hour = parseInt(slotHour, 10);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    throw new Error("Invalid slot hour: " + slotHour);
  }

  let base;
  if (typeof rawDate === "string") {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+/.test(rawDate)) {
      const isoish = rawDate.replace(" ", "T").replace(/(\.\d{3})\d+$/, "$1"); // drop microseconds beyond ms
      base = new Date(isoish); // interpreted as local
    } else {
      base = new Date(rawDate); // ISO (with Z or without)
    }
  } else if (rawDate instanceof Date) {
    base = new Date(rawDate);
  } else {
    throw new Error("Unsupported date input: " + rawDate);
  }

  if (isNaN(base.getTime())) {
    throw new Error("Failed to parse bookingDate: " + rawDate);
  }

  // Compute the date components in IST
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30
  const istEquivalent = new Date(base.getTime() + IST_OFFSET_MS);
  const year = istEquivalent.getFullYear();
  const month = istEquivalent.getMonth(); // zero-based
  const day = istEquivalent.getDate();
  const utcForIstSlot = Date.UTC(year, month, day, hour, 0, 0); // this is YYYY-MM-DD hour:00 UTC
  const adjusted = new Date(utcForIstSlot - IST_OFFSET_MS); // subtract offset to align to IST wall time

  return adjusted;
}

export const bookCourtServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  let {
    venueId,
    courtId,
    bookingDate,
    bookingSlots,
    gameType,
    team1 = [],
    team2 = [],
    askToJoin = false,
    isCompetitive = false,
    skillRequired = 0,
    bookingType,
  } = req.body;

  let paidForPlayers: mongoose.Types.ObjectId[] = [];

  // ********************Validations****************************

  // Get the current date and determine if it's a weekday or weekend
  const dateCheck = makeBookingDateInIST(bookingDate, bookingSlots[0]);
  const dayOfWeek = dateCheck.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dayType = isWeekend ? "weekend" : "weekday";

  // Calculate total payment by summing prices for all slots
  let totalSlotPayment = 0;

  // Get price for each booking slot
  for (const slot of bookingSlots) {
    const slotPrice = await priceModel.findPriceForSlot(dayType, slot);
    if (!slotPrice) {
      return errorResponseHandler(
        `Price configuration not found for slot ${slot}`,
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    totalSlotPayment += slotPrice;
  }

  if (totalSlotPayment === 0) {
    return errorResponseHandler(
      "Price configuration not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const completeCourtPrice: number = totalSlotPayment / bookingSlots.length; // For full court

  // Process all players to set payment information and collect player IDs for paidFor
  [...team1, ...team2].forEach((item) => {
    if (item.playerId) {
      if (item.playerId === userData.id) {
        item.paidBy = "Self";
        item.playerPayment = completeCourtPrice;
        paidForPlayers.push(new mongoose.Types.ObjectId(item.playerId));
        item.rackets = item.rackets || 0;
        item.balls = item.balls || 0;
      } else if (item.playerId !== userData.id) {
        item.paidBy = "User";
        item.playerPayment = 0;
        item.rackets = item.rackets || 0;
        item.balls = item.balls || 0;
        paidForPlayers.push(new mongoose.Types.ObjectId(item.playerId));
      }
    }
  });

  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Create a single transaction for all bookings with player IDs in paidFor
    const bookingTransaction = await transactionModel.create(
      [
        {
          userId: userData.id,
          paidFor: paidForPlayers, // Now storing player IDs instead of player types
          amount: totalSlotPayment,
          currency: "INR",
          text: "Court Booking",
          status: "created",
          notes: bookingSlots,
          isWebhookVerified: false,
        },
      ],
      { session }
    );

    let bookingPayload = {
      userId: userData.id,
      venueId,
      courtId,
      gameType,
      askToJoin,
      isCompetitive,
      skillRequired,
      team1: team1.map((item: any) => {
        if (item.playerId) {
          item.transactionId = bookingTransaction[0]._id;
        }
        return item;
      }),
      team2: team2.map((item: any) => {
        if (item.playerId) {
          item.transactionId = bookingTransaction[0]._id;
        }
        return item;
      }),
      bookingType,
      bookingAmount: completeCourtPrice,
      bookingPaymentStatus: false,
      bookingDate,
    };

    // Create a booking for each slot
    let finalPayload = bookingSlots.map((slot: string) => {
      return {
        ...bookingPayload,
        bookingSlots: slot,
        bookingDate: makeBookingDateInIST(bookingDate, slot),
        expectedPayment: completeCourtPrice,
      };
    });

    const bookings = await bookingModel.insertMany(finalPayload, { session });
    const bookingIds = bookings.map((booking) => booking._id);

    await transactionModel.findByIdAndUpdate(
      bookingTransaction[0]._id,
      { bookingId: bookingIds }, // Store the first booking ID in the transaction
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message: "Court booking initiated",
      data: {
        transaction: {
          ...bookingTransaction[0].toObject(),
          bookingId: bookingIds,
        },
        bookings: bookings,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const joinOpenBookingServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const {
    bookingId,
    requestedTeam,
    requestedPosition,
    rackets,
    balls,
    paymentMethod = "razorpay", // Default payment method
  } = req.body;

  // Validate team and position
  if (!requestedTeam || !["team1", "team2"].includes(requestedTeam)) {
    return errorResponseHandler(
      "Invalid team selection. Must be 'team1' or 'team2'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (
    !requestedPosition ||
    !["player1", "player2", "player3", "player4"].includes(requestedPosition)
  ) {
    return errorResponseHandler(
      "Invalid position selection. Must be 'player1', 'player2', 'player3', or 'player4'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate team and position compatibility
  if (
    (requestedTeam === "team1" &&
      !["player1", "player2"].includes(requestedPosition)) ||
    (requestedTeam === "team2" &&
      !["player3", "player4"].includes(requestedPosition))
  ) {
    return errorResponseHandler(
      "Position is not compatible with selected team",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find the booking with more details
  const booking = await bookingModel
    .findOne({
      _id: bookingId,
      askToJoin: true,
      bookingDate: { $gte: new Date().toISOString() },
    })
    .lean();

  if (!booking) {
    return errorResponseHandler(
      "Booking not found or not open for joining",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if user is already in the requested team
  if (
    booking[requestedTeam as keyof typeof booking].some(
      (player: any) => player.playerId?.toString() === userData.id.toString()
    )
  ) {
    return errorResponseHandler(
      "You are already in this team",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if the requested position is already occupied
  if (
    booking[requestedTeam as keyof typeof booking].some(
      (player: any) => player.playerType === requestedPosition
    )
  ) {
    return errorResponseHandler(
      "This position is already occupied",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if user has already requested to join this booking
  const checkExist = await bookingRequestModel.findOne({
    bookingId,
    requestedBy: userData.id,
  });

  if (checkExist) {
    // If the existing request is pending, delete it and allow creating a new one
    if (checkExist.status === "pending") {
      await bookingRequestModel.findByIdAndDelete(checkExist._id);
    } else {
      // For other statuses (accepted, rejected, completed), return an error
      return errorResponseHandler(
        `You already have a ${checkExist.status} request for this booking`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  if (true) {
    const session = await mongoose.startSession();

    try {
      await session.startTransaction();

      // 1. Create a transaction record for this join request
      // const transaction = await transactionModel.create(
      //   [
      //     {
      //       userId: userData.id,
      //       bookingId: [new mongoose.Types.ObjectId(bookingId)],
      //       paidFor: [new mongoose.Types.ObjectId(userData.id)],
      //       amount: 0,
      //       currency: "INR",
      //       text: "Court Joining",
      //       status: "captured",
      //       notes: {
      //         bookingSlot: booking.bookingSlots,
      //         requestedTeam,
      //         requestedPosition,
      //         rackets: rackets || 0,
      //         balls: balls || 0,
      //       },
      //       isWebhookVerified: true,
      //       method: null,
      //       playcoinsUsed: 0,
      //       razorpayAmount: 0,
      //       paymentDate: true,
      //       playcoinsDeducted: false,
      //     },
      //   ],
      //   { session }
      // );

      // 2. Create the booking request with transaction ID
      const requestData = {
        bookingId,
        requestedBy: userData.id,
        requestedTo: booking.userId,
        requestedTeam,
        requestedPosition,
        status: "completed", // If fully paid with playcoins, mark as completed
        rackets: rackets || 0,
        balls: balls || 0,
        playerPayment: 0,
        paymentStatus: "Paid",
        transactionId: null, // Link to the transaction
      };

      const bookingRequest = (await bookingRequestModel.create([requestData], {
        session,
      })) as any;

      // 4. If payment is completed with playcoins, update the booking immediately
      if (true) {
        // Create player object with payment details
        const playerObject = {
          playerId: userData.id,
          playerType: requestedPosition,
          playerPayment: 0,
          paymentStatus: "Paid",
          transactionId: null,
          paidBy: "User",
          rackets: rackets || 0,
          balls: balls || 0,
        };

        // Update the booking to add the player to the requested team and position
        const bookingToUpdate = await bookingModel.findById(bookingId);

        const checkGroupExist = await chatModel.findOne({
          bookingId: bookingId,
          participants: { $all: [userData.id] },
        });

        if (!checkGroupExist) {
          await chatModel.updateOne(
            { bookingId: bookingId },
            {
              $addToSet: {
                participants: userData.id,
              },
            },
            { session }
          );
        }

        if (bookingToUpdate) {
          // Add player to the requested team
          if (requestedTeam === "team1") {
            bookingToUpdate.team1 = bookingToUpdate.team1.filter(
              (player: any) => player.playerType !== requestedPosition
            );
            bookingToUpdate.team1.push(playerObject);
          } else {
            bookingToUpdate.team2 = bookingToUpdate.team2.filter(
              (player: any) => player.playerType !== requestedPosition
            );
            bookingToUpdate.team2.push(playerObject);
          }

          await bookingToUpdate.save({ session });

          // Get the new player's details
          const newPlayer = await usersModel
            .findById(userData.id)
            .select("fullName profilePic")
            .lean();

          if (!newPlayer) {
            console.error(`User not found for ID: ${userData.id}`);
          }

          // Get all existing players in the booking
          const existingPlayerIds = [
            ...bookingToUpdate.team1
              .map((player: any) => player.playerId?.toString())
              .filter(Boolean),
            ...bookingToUpdate.team2
              .map((player: any) => player.playerId?.toString())
              .filter(Boolean),
          ];

          // Remove the new player from the list (to avoid sending notification to themselves)
          const otherPlayerIds = existingPlayerIds.filter(
            (id) => id !== userData.id.toString()
          );

          // Add booking owner to notification recipients if not already included
          if (
            bookingToUpdate.userId.toString() !== userData.id.toString() &&
            !otherPlayerIds.includes(bookingToUpdate.userId.toString())
          ) {
            otherPlayerIds.push(bookingToUpdate.userId.toString());
          }

          // Send notifications to all existing players about the new player joining
          if (newPlayer && otherPlayerIds.length > 0) {
            const teamName = requestedTeam === "team1" ? "Team 1" : "Team 2";
            const positionName =
              requestedPosition.charAt(0).toUpperCase() +
              requestedPosition.slice(1);

            // Send notifications to all existing players

            await Promise.all([
              otherPlayerIds?.map(async (data: any) => {
                await notifyUser({
                  recipientId: data,
                  type: "PLAYER_JOINED_GAME",
                  title: "New Player Joined",
                  message: `${newPlayer.fullName} has joined your game as ${positionName} in ${teamName}.`,
                  category: "GAME",
                  notificationType: "BOTH", // Send both in-app and push notification
                  referenceId: bookingId,
                  referenceType: "bookings",
                  priority: "MEDIUM",
                  metadata: {
                    bookingId,
                    newPlayerId: userData.id,
                    newPlayerName: newPlayer.fullName,
                    newPlayerPosition: requestedPosition,
                    newPlayerTeam: requestedTeam,
                    timestamp: new Date().toISOString(),
                  },
                  session,
                });
              }),
            ]);
          }
        }

        await session.commitTransaction();

        return {
          success: true,
          message: "Game joined successfully",
          data: {
            request: bookingRequest[0],
            transaction: null,
            payment: {},
          },
        };
      }
    } catch (error) {
      await session.abortTransaction();
      console.error("Error in joinOpenBookingServices:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  }
};

export const userNotificationServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    notificationModel
      .find({
        recipientId: userData.id,
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    notificationModel.countDocuments({
      recipientId: userData.id,
      isDeleted: false,
    }),
  ]);

  return {
    success: true,
    message: "Notifications retrieved successfully",
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasPreviousPage: page > 1,
      hasNextPage: page * limit < total,
    },
  };
};

export const readUserNotificationServices = async (
  req: Request,
  res: Response
) => {
  const userData = req.user as any;
  const { notificationId } = req.body;

  try {
    let result;

    if (!notificationId) {
      result = await notificationModel.updateMany(
        { recipientId: userData.id, isRead: false, isDeleted: false },
        { $set: { isRead: true } }
      );
    } else {
      result = await notificationModel.updateOne(
        {
          _id: new mongoose.Types.ObjectId(notificationId),
          recipientId: userData.id,
          isDeleted: false,
        },
        { $set: { isRead: true } }
      );
    }

    return {
      success: true,
      message:
        result.modifiedCount > 1
          ? "All notifications marked as read"
          : "Notification marked as read",
      updatedCount: result.modifiedCount,
    };
  } catch (error: any) {
    throw error;
  }
};

export const paymentBookingServices = async (req: Request, res: Response) => {
  const { transactionId, method } = req.body;
  const userData = req.user as any;

  if (["razorpay", "playcoins", "both", "free"].includes(method) === false) {
    return errorResponseHandler(
      "Invalid payment method",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!transactionId) {
    return errorResponseHandler(
      "Transaction ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find the transaction
  const transaction = await transactionModel.findById(transactionId).lean();

  if (!transaction) {
    return errorResponseHandler(
      "Transaction not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (transaction.isWebhookVerified) {
    return errorResponseHandler(
      "Payment already completed for this transaction",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const bookingIds = transaction.bookingId || [];

  if (bookingIds.length === 0) {
    return errorResponseHandler(
      "No bookings associated with this transaction",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Get user's playcoins balance
  const userInfo = await additionalUserInfoModel
    .findOne({ userId: userData.id })
    .lean();

  const playcoinsBalance = userInfo?.playCoins || 0;

  // Start a MongoDB session for transaction consistency
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    if (method === "playcoins") {
      // Check if user has enough playcoins
      if (playcoinsBalance < transaction.amount) {
        await session.abortTransaction();
        return errorResponseHandler(
          "Insufficient playcoins balance",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      // Deduct playcoins from user's balance
      await additionalUserInfoModel.findOneAndUpdate(
        { userId: userData.id },
        { $inc: { playCoins: -transaction.amount } },
        { session }
      );

      // Update transaction status
      await transactionModel.findByIdAndUpdate(
        transactionId,
        {
          status: "completed",
          isWebhookVerified: true,
          method: "playcoins",
          playcoinsUsed: transaction.amount,
          paymentDate: new Date(),
        },
        { session }
      );

      // Update all associated bookings
      await bookingModel.updateMany(
        { _id: { $in: bookingIds } },
        { bookingPaymentStatus: true },
        { session }
      );

      // Update player payment status in each booking
      const bookings = await bookingModel.find(
        { _id: { $in: bookingIds } },
        null,
        { session }
      );

      const paidForPlayerIds =
        transaction.paidFor?.map((id) => id.toString()) || [];

      let allPlayerIds: any[] = [];
      let bookingId: any;

      for (const booking of bookings) {
        // Update team1 players
        booking.team1 = booking.team1.map((player: any) => {
          if (
            player.playerId &&
            paidForPlayerIds.includes(player.playerId.toString())
          ) {
            player.paymentStatus = "Paid";
          }
          return player;
        });

        // Update team2 players
        booking.team2 = booking.team2.map((player: any) => {
          if (
            player.playerId &&
            paidForPlayerIds.includes(player.playerId.toString())
          ) {
            player.paymentStatus = "Paid";
          }
          return player;
        });

        await booking.save({ session });

        const checkGroupExist = await chatModel.findOne({
          bookingId: booking._id,
        });

        if (!checkGroupExist) {
          const groupImage = await venueModel.findById(
            booking.venueId,
            "image"
          );
          await chatModel.create({
            bookingId: booking._id,
            groupImage: groupImage?.image || "",
            chatType: "group",
            groupName: `Match on ${booking.bookingDate.toLocaleDateString()}`,
            participants: [
              ...booking.team1.map((player: any) => player.playerId),
              ...booking.team2.map((player: any) => player.playerId),
            ],
            groupAdmin: [booking.userId],
            messages: [],
            isActive: true,
          });
        }

        allPlayerIds = [
          ...booking.team1.map((player: any) => player.playerId),
          ...booking.team2.map((player: any) => player.playerId),
        ];

        bookingId = booking._id;
      }

      for (const playerId of allPlayerIds) {
        await notifyUser({
          recipientId: playerId,
          type: "PAYMENT_SUCCESSFUL",
          title: "Game Booked Successfully",
          message: `Your payment of ${transaction.amount} PlayCoins for booking has been successfully processed.`,
          category: "PAYMENT",
          notificationType: "BOTH",
          referenceId: bookingId.toString(),
          priority:
            playerId.toString() == transaction.userId.toString()
              ? "HIGH"
              : "MEDIUM",
          referenceType: "bookings",
          metadata: {
            bookingId: bookingId,
            transactionId: transaction._id,
            amount: transaction.amount,
            timestamp: new Date().toISOString(),
          },
          session,
        });
      }

      await session.commitTransaction();

      // for (const booking of bookings) {
      //   await sendInvoiceToUser(userData.id, booking._id);
      // }

      return {
        success: true,
        message: "Payment completed successfully using playcoins",
        data: {
          transaction: await transactionModel.findById(transactionId),
        },
      };
    } else if (method === "both") {
      // Calculate how much to pay with playcoins and how much with razorpay
      const playcoinsToUse = Math.min(playcoinsBalance, transaction.amount);
      const razorpayAmount = transaction.amount - playcoinsToUse;

      // if (playcoinsToUse > 0) {
      //   // Deduct playcoins from user's balance
      //   await additionalUserInfoModel.findOneAndUpdate(
      //     { userId: userData.id },
      //     { $inc: { playCoins: -playcoinsToUse } },
      //     { session }
      //   );
      // }

      // Update transaction with split payment info
      await transactionModel.findByIdAndUpdate(
        transactionId,
        {
          playcoinsUsed: playcoinsToUse,
          method: "both",
        },
        { session }
      );

      // If razorpay amount is 0 (full payment with playcoins), complete the transaction
      if (razorpayAmount === 0) {
        await transactionModel.findByIdAndUpdate(
          transactionId,
          {
            status: "captured",
            isWebhookVerified: true,
            paymentDate: new Date(),
          },
          { session }
        );

        // Update all associated bookings
        await bookingModel.updateMany(
          { _id: { $in: bookingIds } },
          { bookingPaymentStatus: true },
          { session }
        );

        // Update player payment status in each booking
        const bookings = await bookingModel.find(
          { _id: { $in: bookingIds } },
          null,
          { session }
        );

        const paidForPlayerIds =
          transaction.paidFor?.map((id) => id.toString()) || [];

        let allPlayerIds: any[] = [];
        let bookingId: any;

        for (const booking of bookings) {
          // Update team1 players
          booking.team1 = booking.team1.map((player: any) => {
            if (
              player.playerId &&
              paidForPlayerIds.includes(player.playerId.toString())
            ) {
              player.paymentStatus = "Paid";
            }
            return player;
          });

          // Update team2 players
          booking.team2 = booking.team2.map((player: any) => {
            if (
              player.playerId &&
              paidForPlayerIds.includes(player.playerId.toString())
            ) {
              player.paymentStatus = "Paid";
            }
            return player;
          });

          await booking.save({ session });

          allPlayerIds = [
            ...booking.team1.map((player: any) => player.playerId),
            ...booking.team2.map((player: any) => player.playerId),
          ];
          bookingId = booking._id;
        }

        await Promise.all(
          allPlayerIds.map((playerId) =>
            notifyUser({
              recipientId: playerId,
              type: "PAYMENT_SUCCESSFUL",
              title: "Game Booked Successfully",
              message: `Your payment of ₹${transaction.amount} for booking has been successfully processed.`,
              category: "PAYMENT",
              notificationType: "BOTH",
              referenceId: bookingId.toString(),
              priority:
                playerId.toString() == transaction.userId.toString()
                  ? "HIGH"
                  : "MEDIUM",
              referenceType: "bookings",
              metadata: {
                bookingId: bookingId,
                transactionId: transaction._id,
                amount: transaction.amount,
                timestamp: new Date().toISOString(),
              },
              session,
            })
          )
        );

        await session.commitTransaction();

        return {
          success: true,
          message: "Payment completed successfully using playcoins",
          data: {
            transaction: await transactionModel.findById(transactionId),
          },
        };
      }

      // Create Razorpay order for remaining amount
      const options = {
        amount: razorpayAmount * 100, // Amount in paise
        currency: transaction.currency,
        receipt: transaction._id.toString(),
        notes: {
          bookingId: transaction.bookingId?.map((id) => id.toString()),
          userId: transaction.userId.toString(),
          paidFor: transaction.paidFor?.map((id) => id.toString()),
          playcoinsUsed: playcoinsToUse,
        },
      };

      const razorpayOrder = await razorpayInstance.orders.create(
        options as any
      );

      await transactionModel.findByIdAndUpdate(
        transactionId,
        {
          razorpayOrderId: razorpayOrder.id,
        },
        { session }
      );

      await session.commitTransaction();

      return {
        success: true,
        message:
          "Partial payment with playcoins successful. Razorpay order created for remaining amount.",
        data: {
          razorpayOrderId: razorpayOrder.id,
          amount: razorpayAmount,
          playcoinsUsed: playcoinsToUse,
          currency: transaction.currency,
          receipt: transaction._id.toString(),
        },
      };
    } else if (method === "razorpay") {
      // Original razorpay flow
      const options = {
        amount: transaction.amount * 100, // Amount in paise
        currency: transaction.currency,
        receipt: transaction._id.toString(),
        notes: {
          bookingId: transaction.bookingId?.map((id) => id.toString()),
          userId: transaction.userId.toString(),
          paidFor: transaction.paidFor?.map((id) => id.toString()),
        },
      };

      const razorpayOrder = await razorpayInstance.orders.create(
        options as any
      );

      await transactionModel.findByIdAndUpdate(
        transactionId,
        {
          razorpayOrderId: razorpayOrder.id,
          status: "created",
          method: "razorpay",
        },
        { session }
      );

      await session.commitTransaction();

      return {
        success: true,
        message: "Razorpay order created successfully",
        data: {
          razorpayOrderId: razorpayOrder.id,
          amount: transaction.amount,
          currency: transaction.currency,
          receipt: transaction._id.toString(),
        },
      };
    } else if (method === "free") {
      if (
        !userInfo?.freeGameCount ||
        (userInfo?.freeGameCount || 0) < bookingIds?.length
      ) {
        await session.abortTransaction();
        return errorResponseHandler(
          "Not enough free games available",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      // Deduct playcoins from user's balance
      await additionalUserInfoModel.findOneAndUpdate(
        { userId: userData.id },
        { $inc: { freeGameCount: -bookingIds?.length } },
        { session }
      );

      // Update transaction status
      await transactionModel.findByIdAndUpdate(
        transactionId,
        {
          status: "completed",
          isWebhookVerified: true,
          method: "freeGame",
          playcoinsUsed: 0,
          amount: 0,
          paymentDate: new Date(),
        },
        { session }
      );

      // Update all associated bookings
      await bookingModel.updateMany(
        { _id: { $in: bookingIds } },
        { bookingPaymentStatus: true, bookingAmount: 0 },
        { session }
      );

      // Update player payment status in each booking
      const bookings = await bookingModel.find(
        { _id: { $in: bookingIds } },
        null,
        { session }
      );

      const paidForPlayerIds =
        transaction.paidFor?.map((id) => id.toString()) || [];

      let allPlayerIds: any[] = [];
      let bookingId: any;

      for (const booking of bookings) {
        // Update team1 players
        booking.team1 = booking.team1.map((player: any) => {
          if (
            player.playerId &&
            paidForPlayerIds.includes(player.playerId.toString())
          ) {
            player.paymentStatus = "Paid";
          }
          return player;
        });

        // Update team2 players
        booking.team2 = booking.team2.map((player: any) => {
          if (
            player.playerId &&
            paidForPlayerIds.includes(player.playerId.toString())
          ) {
            player.paymentStatus = "Paid";
          }
          return player;
        });

        await booking.save({ session });

        const checkGroupExist = await chatModel.findOne({
          bookingId: booking._id,
        });

        if (!checkGroupExist) {
          const groupImage = await venueModel.findById(
            booking.venueId,
            "image"
          );
          await chatModel.create({
            bookingId: booking._id,
            groupImage: groupImage?.image || "",
            chatType: "group",
            groupName: `Match on ${booking.bookingDate.toLocaleDateString()}`,
            participants: [
              ...booking.team1.map((player: any) => player.playerId),
              ...booking.team2.map((player: any) => player.playerId),
            ],
            groupAdmin: [booking.userId],
            messages: [],
            isActive: true,
          });
        }

        allPlayerIds = [
          ...booking.team1.map((player: any) => player.playerId),
          ...booking.team2.map((player: any) => player.playerId),
        ];
        bookingId = booking._id;
      }

      for (const playerId of allPlayerIds) {
        await notifyUser({
          recipientId: playerId,
          type: "FREE_GAME_USED",
          title: "Game Booked Successfully",
          message: `Your free booking has been successfully processed.`,
          category: "PAYMENT",
          notificationType: "BOTH",
          referenceId: bookingId.toString(),
          priority:
            playerId.toString() == transaction.userId.toString()
              ? "HIGH"
              : "MEDIUM",
          referenceType: "bookings",
          metadata: {
            bookingId: bookingId,
            transactionId: transaction._id,
            amount: 0,
            timestamp: new Date().toISOString(),
          },
          session,
        });
      }

      await session.commitTransaction();

      // for (const booking of bookings) {
      //   await sendInvoiceToUser(userData.id, booking._id);
      // }

      return {
        success: true,
        message: "Booking successful using free game",
        data: {
          transaction: await transactionModel.findById(transactionId),
        },
      };
    } else {
      await session.abortTransaction();
      return errorResponseHandler(
        "Invalid payment method",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  } catch (error) {
    console.error("Error in payment booking service:", error);
    throw error;
  } finally {
    await session.endSession();
  }
};

export const modifyBookingServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const bookingId = req.params.id;
  const { team1, team2 } = req.body;

  const booking = await bookingModel.findById(bookingId).lean();

  if (!booking) {
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (booking.userId.toString() !== userData.id.toString()) {
    return errorResponseHandler(
      "Only the booking creator can modify this booking",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  if (booking.askToJoin === true) {
    return errorResponseHandler(
      "Public games cannot be modified",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const [slotHour, slotMinute] = booking.bookingSlots.split(":").map(Number);
  const bookingDateTime = new Date(booking.bookingDate);
  bookingDateTime.setUTCHours(slotHour - 5, slotMinute - 30, 0, 0); // Convert IST to UTC

  const currentUTC = new Date();

  if (bookingDateTime < currentUTC) {
    return errorResponseHandler(
      "Cannot modify a booking that has already passed",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const diffMs = bookingDateTime.getTime() - currentUTC.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 4) {
    return errorResponseHandler(
      "Bookings can only be modified at least 4 hours before the scheduled time",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // ✅ Direct assignment without loops
  // Update team1
  const updatedTeam1 = [];
  if (team1?.[0]?.playerId) {
    booking.team1[0].playerId = team1[0].playerId;
    updatedTeam1.push(booking.team1[0]);
  }
  if (team1?.[1]?.playerId) {
    if (booking.team1[1]) {
      booking.team1[1].playerId = team1[1].playerId;
      updatedTeam1.push(booking.team1[1]);
    } else {
      updatedTeam1.push({
        ...team1?.[1],
        playerType: "player2",
        playerPayment: team1[0].playerPayment,
        paidBy: "User",
        paymentStatus: "Paid",
      });
    }
  }
  booking.team1 = updatedTeam1;

  // Update team2
  const updatedTeam2 = [];
  if (team2?.[0]?.playerId) {
    if (booking.team2[0]) {
      booking.team2[0].playerId = team2[0].playerId;
      updatedTeam2.push(booking.team2[0]);
    } else {
      updatedTeam2.push({
        ...team2?.[0],
        playerType: "player3",
        playerPayment: team1[0].playerPayment,
        paidBy: "User",
        paymentStatus: "Paid",
      });
    }
  }
  if (team2?.[1]?.playerId) {
    if (booking.team2[1]) {
      booking.team2[1].playerId = team2[1].playerId;
      updatedTeam2.push(booking.team2[1]);
    } else {
      updatedTeam2.push({
        ...team2?.[1],
        playerType: "player4",
        playerPayment: team1[0].playerPayment,
        paidBy: "User",
        paymentStatus: "Paid",
      });
    }
  }
  booking.team2 = updatedTeam2;

  await bookingModel.findByIdAndUpdate(bookingId, {
    team1: updatedTeam1,
    team2: updatedTeam2,
  });

  return {
    success: true,
    message: "Booking updated successfully",
    data: {},
  };
};

export const getDynamicPriceServices = async (req: Request, res: Response) => {
  // Check if date is provided, otherwise use current date
  let { date } = req.query;
  const currentDate = date ? new Date(date as string) : new Date();

  // Determine if it's a weekend (0 = Sunday, 6 = Saturday)
  const dayOfWeek = currentDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = false;

  // Set dayType based on whether it's a weekend/holiday or weekday
  const dayType = isWeekend || isHoliday ? "weekend" : "weekday";

  // Find pricing based on dayType
  const pricing = await priceModel
    .findOne({
      dayType,
      isActive: true,
    })
    .lean();

  if (!pricing) {
    return errorResponseHandler(
      "Pricing not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Pricing retrieved successfully",
    data: pricing,
  };
};

export const cancelBookingServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { bookingId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  const booking = await bookingModel
    .findOne({
      _id: bookingId,
      bookingType: { $ne: "Cancelled" },
      userId: userData.id,
    })
    .lean();

  if (!booking) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // if (booking.userId.toString() !== userData.id.toString()) {
  //   await session.abortTransaction();
  //   return errorResponseHandler(
  //     "Only the booking creator can cancel this booking",
  //     httpStatusCode.UNAUTHORIZED,
  //     res
  //   );
  // }

  // if (booking.askToJoin === true) {
  //   await session.abortTransaction();
  //   return errorResponseHandler(
  //     "Cannot cancel a booking that is open for others to join",
  //     httpStatusCode.BAD_REQUEST,
  //     res
  //   );
  // }

  const userTransaction = await transactionModel
    .findOne({
      bookingId,
      userId: userData.id,
    })
    .lean();

  if (!userTransaction || !userTransaction.isWebhookVerified) {
    await session.abortTransaction();
    return errorResponseHandler(
      "No verified transaction found for this booking",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (userTransaction.status === "refunded") {
    await session.abortTransaction();
    return errorResponseHandler(
      "This booking has already been cancelled",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const currentTime = new Date().toISOString();

  console.log(booking.bookingDate, currentTime);

  function diffHours(a: any, b: any) {
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    const diffMs = Math.abs(da.getTime() - db.getTime());
    return diffMs / (1000 * 60 * 60);
  }
  const hours = diffHours(currentTime, booking.bookingDate);

  if (booking.bookingDate.toISOString() < currentTime) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Cannot cancel a booking that has already passed",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (hours < 24) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Bookings can only be cancelled at least 24 hours before the scheduled time",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Refund only in playcoins
  if (userTransaction.amount > 0) {
    await additionalUserInfoModel.findOneAndUpdate(
      { userId: userData.id },
      { $inc: { playCoins: booking.bookingAmount } },
      { session }
    );
    notifyUser({
      recipientId: userData.id,
      type: "REFUND_COMPLETED",
      title: "Refund Completed Successfully",
      message: `Your have received a refund of ${booking.bookingAmount} play coins.`,
      category: "PAYMENT",
      notificationType: "BOTH",
      referenceId: bookingId,
      priority: "HIGH",
      referenceType: "orders",
      metadata: {
        amount: booking.bookingAmount,
      },
      session,
    });
  }

  // Refund via Razorpay if applicable
  // let refund = null;
  // const actualRefundAmount =
  //   userTransaction.amount - userTransaction.playcoinsUsed;
  // if (userTransaction.razorpayPaymentId && actualRefundAmount > 0) {
  //   refund = await razorpayInstance.payments.refund(
  //     userTransaction.razorpayPaymentId,
  //     {
  //       amount: Math.round(actualRefundAmount * 100),
  //       notes: {
  //         bookingId,
  //         userId: userData.id.toString(),
  //         reason: "Booking creator cancelled booking",
  //       },
  //     }
  //   );
  // }

  await chatModel.deleteOne({ bookingId }, { session });

  await transactionModel.create(
    [
      {
        userId: userData.id,
        bookingId,
        text: "Booking cancelled by creator",
        amount: booking.bookingAmount,
        playcoinsReceived: booking.bookingAmount,
        method: userTransaction?.method,
        status: "refunded",
        isWebhookVerified: true,
        razorpayRefundId: null,
        transactionDate: new Date(),
      },
    ],
    { session }
  );

  // Update booking record
  await bookingModel.findByIdAndUpdate(
    bookingId,
    {
      cancellationReason: "Creator cancelled booking",
      bookingType: "Cancelled",
    },
    { session }
  );

  // Collect IDs of teammates (excluding self)
  const playerIds = new Set<string>();
  booking.team1?.forEach((player: any) => {
    if (player.playerId?.toString() !== userData.id.toString()) {
      playerIds.add(player.playerId.toString());
    }
  });
  booking.team2?.forEach((player: any) => {
    if (player.playerId?.toString() !== userData.id.toString()) {
      playerIds.add(player.playerId.toString());
    }
  });

  // Create notifications for teammates
  const notifications = Array.from(playerIds).map((playerId) => ({
    recipientId: playerId,
    type: "BOOKING_CANCELLED",
    title: "Booking Cancelled",
    message: `The booking scheduled for ${booking.bookingDate.toLocaleDateString()} at ${
      booking.bookingSlots
    } has been cancelled by the creator.`,
    category: "BOOKING",
    priority: "HIGH",
    referenceId: bookingId,
    referenceType: "bookings",
    notificationType: "BOTH", // Send both in-app and push notification
    session,
  }));

  await Promise.all(
    notifications.map((notification) => notifyUser(notification as any))
  );

  await session.commitTransaction();

  return {
    success: true,
    message: "Booking cancelled successfully",
    data: {
      bookingId,
      refundId: null,
      refundAmount: 0,
      playcoinsRefunded: userTransaction.amount,
    },
  };
};
