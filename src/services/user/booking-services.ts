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
  const currentDate = new Date();
  const dayOfWeek = currentDate.getDay();
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

  const playerPayment: number = totalSlotPayment / bookingSlots.length / 4; // Average per slot
  const bookingPrice: number = (totalSlotPayment * 2) / bookingSlots.length / 4; // For half court
  const completeCourtPrice: number = totalSlotPayment / bookingSlots.length; // For full court

  // Process all players to set payment information and collect player IDs for paidFor
  [...team1, ...team2].forEach((item) => {
    if (item.playerId) {
      if (item.playerId === userData.id) {
        item.paidBy = "Self";
        item.playerPayment = playerPayment;
        // Add player ID to paidFor array
        paidForPlayers.push(new mongoose.Types.ObjectId(item.playerId));
      } else if (item.playerId !== userData.id) {
        item.paidBy = "User";
        item.playerPayment = playerPayment;
        // Add player ID to paidFor array
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
          amount:
            bookingType === "Complete"
              ? completeCourtPrice * bookingSlots.length
              : bookingPrice * bookingSlots.length,
          currency: "INR",
          status: "created",
          notes: bookingSlots,
          isWebhookVerified: false,
        },
      ],
      { session }
    );

    // Prepare booking payload
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
      bookingAmount:
        bookingType === "Complete" ? completeCourtPrice : bookingPrice,
      bookingPaymentStatus: false,
      bookingDate,
    };

    // Create a booking for each slot
    let finalPayload = bookingSlots.map((slot: string) => {
      return {
        ...bookingPayload,
        bookingSlots: slot,
        expectedPayment: completeCourtPrice,
      };
    });

    // Insert the bookings
    const bookings = await bookingModel.insertMany(finalPayload, { session });

    // Get all booking IDs
    const bookingIds = bookings.map((booking) => booking._id);

    // Update the transaction with the booking IDs
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
    racketA,
    racketB,
    racketC,
    balls,
    paymentMethod = "razorpay", // Default payment method
  } = req.body;

  // Validate payment method
  if (!["razorpay", "playcoins", "both"].includes(paymentMethod)) {
    return errorResponseHandler(
      "Invalid payment method. Must be 'razorpay', 'playcoins', or 'both'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

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
      // bookingDate: { $gte: new Date() },
    })
    .lean();

  if (!booking) {
    return errorResponseHandler(
      "Booking not found or not open for joining",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get current time in UTC to ensure consistent comparison
  const now = new Date();

  // Create booking date object and normalize to start of day in UTC
  const bookingDate = new Date(booking.bookingDate);

  // Get the booking slot time
  const bookingSlot = booking.bookingSlots;
  const [slotHour, slotMinute] = bookingSlot
    .split(":")
    .map((num) => parseInt(num, 10));

  // Create a date object for the exact booking time
  const bookingTime = new Date(bookingDate);
  bookingTime.setHours(slotHour, slotMinute || 0, 0, 0);

  // Compare the full datetime objects
  if (bookingTime < now) {
    return errorResponseHandler(
      "Cannot join a booking that has already started or passed",
      httpStatusCode.BAD_REQUEST,
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
      console.log(`Deleting existing pending request: ${checkExist._id}`);
      await bookingRequestModel.findByIdAndDelete(checkExist._id);
      // Continue with the rest of the function to create a new request
    } else {
      // For other statuses (accepted, rejected, completed), return an error
      return errorResponseHandler(
        `You already have a ${checkExist.status} request for this booking`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Determine if it's a weekday or weekend
  const bookingDayOfWeek = bookingDate.getDay();
  const isWeekend = bookingDayOfWeek === 0 || bookingDayOfWeek === 6;
  const dayType = isWeekend ? "weekend" : "weekday";

  // Get the price for the booking slot
  let slotPrice = await priceModel.findPriceForSlot(dayType, bookingSlot);
  slotPrice = Number(slotPrice || 0) / 4;
  if (!slotPrice) {
    return errorResponseHandler(
      `Price configuration not found for slot ${bookingSlot}`,
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get user's playcoins balance if payment method involves playcoins
  let playcoinsBalance = 0;
  if (paymentMethod === "playcoins" || paymentMethod === "both") {
    const userInfo = await additionalUserInfoModel
      .findOne({ userId: userData.id })
      .lean();

    playcoinsBalance = userInfo?.playCoins || 0;

    // Check if user has enough playcoins when using only playcoins
    if (paymentMethod === "playcoins" && playcoinsBalance < slotPrice) {
      return errorResponseHandler(
        "Insufficient playcoins balance",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Start a MongoDB session for transaction consistency
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Calculate payment details based on method
    const playcoinsToUse =
      paymentMethod === "razorpay" ? 0 : Math.min(playcoinsBalance, slotPrice);
    const razorpayAmount = slotPrice - playcoinsToUse;

    // Determine if payment can be completed immediately with playcoins
    const canCompleteWithPlaycoins =
      paymentMethod === "playcoins" && playcoinsToUse >= slotPrice;
    const transactionStatus = canCompleteWithPlaycoins ? "captured" : "created";
    const isWebhookVerified = canCompleteWithPlaycoins;

    // 1. Create a transaction record for this join request
    const transaction = await transactionModel.create(
      [
        {
          userId: userData.id,
          bookingId: [new mongoose.Types.ObjectId(bookingId)],
          paidFor: [new mongoose.Types.ObjectId(userData.id)],
          amount: slotPrice,
          currency: "INR",
          status: transactionStatus,
          notes: {
            bookingSlot,
            requestedTeam,
            requestedPosition,
            racketA: racketA || 0,
            racketB: racketB || 0,
            racketC: racketC || 0,
            balls: balls || 0,
          },
          isWebhookVerified: isWebhookVerified,
          method: paymentMethod,
          playcoinsUsed: playcoinsToUse,
          razorpayAmount: razorpayAmount,
          paymentDate: isWebhookVerified ? new Date() : null,
          playcoinsDeducted: paymentMethod === "playcoins" ? true : false,
        },
      ],
      { session }
    );

    // Deduct playcoins ONLY if using playcoins method (not both)
    if (paymentMethod === "playcoins" && playcoinsToUse > 0) {
      await additionalUserInfoModel.findOneAndUpdate(
        { userId: userData.id },
        { $inc: { playCoins: -playcoinsToUse } },
        { session }
      );
    }

    // For "both" method, reserve the playcoins but don't deduct yet
    if (paymentMethod === "both" && playcoinsToUse > 0) {
      await additionalUserInfoModel.findOneAndUpdate(
        { userId: userData.id },
        { $inc: { reservedPlayCoins: playcoinsToUse } },
        { session }
      );

      // Update transaction to indicate playcoins are reserved
      await transactionModel.findByIdAndUpdate(
        transaction[0]._id,
        { playcoinsReserved: true },
        { session }
      );
    }

    // 2. Create the booking request with transaction ID
    const requestData = {
      bookingId,
      requestedBy: userData.id,
      requestedTo: booking.userId,
      requestedTeam,
      requestedPosition,
      status: canCompleteWithPlaycoins ? "completed" : "pending", // If fully paid with playcoins, mark as completed
      racketA: racketA || 0,
      racketB: racketB || 0,
      racketC: racketC || 0,
      balls: balls || 0,
      playerPayment: slotPrice,
      paymentStatus: isWebhookVerified ? "Paid" : "Pending",
      transactionId: transaction[0]._id, // Link to the transaction
    };

    const bookingRequest = (await bookingRequestModel.create([requestData], {
      session,
    })) as any;

    // 3. Create notification for the booking owner
    await createNotification({
      recipientId: booking.userId,
      senderId: userData.id,
      type: "GAME_INVITATION",
      title: "Game Invitation",
      message: `${userData.name} requested to join your game.`,
      category: "GAME",
      referenceId: bookingId,
      referenceType: "bookings",
    });

    // 4. If payment is completed with playcoins, update the booking immediately
    if (isWebhookVerified) {
      // Create player object with payment details
      const playerObject = {
        playerId: userData.id,
        playerType: requestedPosition,
        playerPayment: slotPrice,
        paymentStatus: "Paid",
        transactionId: transaction[0]._id,
        paidBy: "Self",
        racketA: racketA || 0,
        racketB: racketB || 0,
        racketC: racketC || 0,
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

        // Create notification for the user that their request was accepted
        // await createNotification(
        //   {
        //     recipientId: userData.id,
        //     senderId: booking.userId,
        //     type: "REQUEST_ACCEPTED",
        //     title: "Request Accepted",
        //     message: `Your request to join the game has been accepted.`,
        //     category: "GAME",
        //     referenceId: bookingId,
        //     referenceType: "bookings",
        //   },
        //   { session }
        // );
      }
    }

    // 5. Handle payment based on method
    let paymentDetails = null;

    if (
      (paymentMethod === "razorpay" || paymentMethod === "both") &&
      razorpayAmount > 0
    ) {
      // Create a Razorpay order for the full amount or remaining amount
      const options = {
        amount: razorpayAmount * 100, // Amount in paise
        currency: "INR",
        receipt: (transaction[0]._id as mongoose.Types.ObjectId).toString(),
        notes: {
          bookingId: bookingId,
          userId: userData.id.toString(),
          requestId: bookingRequest[0]._id.toString(),
          requestedTeam,
          requestedPosition,
          playcoinsUsed: playcoinsToUse,
        },
      };

      interface RazorpayOrder {
        id: string;
      }

      const razorpayOrder: RazorpayOrder =
        (await razorpayInstance.orders.create(options as any)) as any;

      // Update transaction with Razorpay order ID
      await transactionModel.findByIdAndUpdate(
        transaction[0]._id,
        { razorpayOrderId: razorpayOrder.id },
        { session }
      );

      paymentDetails = {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayAmount,
        playcoinsUsed: playcoinsToUse,
        currency: "INR",
      };
    } else {
      // Payment is completed with playcoins (either method="playcoins" or method="both" with enough coins)
      paymentDetails = {
        method: "playcoins",
        amount: slotPrice,
        playcoinsUsed: playcoinsToUse,
        status: "completed",
      };
    }

    await session.commitTransaction();

    return {
      success: true,
      message: "Request to join the game sent successfully",
      data: {
        request: bookingRequest[0],
        transaction: transaction[0],
        payment: paymentDetails,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Error in joinOpenBookingServices:", error);
    throw error;
  } finally {
    await session.endSession();
  }
};

export const userNotificationServices = async (req: Request, res: Response) => {
  const userData = req.user as any;

  const data = await notificationModel.find({
    recipientId: userData.id,
  });

  return {
    success: true,
    message: "Notifications retrieved successfully",
    data: data,
  };
};

export const paymentBookingServices = async (req: Request, res: Response) => {
  const { transactionId, method } = req.body;
  const userData = req.user as any;

  if (["razorpay", "playcoins", "both"].includes(method) === false) {
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
          await chatModel.create({
            bookingId: booking._id,
            chatType: "group",
            groupName: `Booking Chat - ${booking._id}`,
            participants: [
              ...booking.team1.map((player: any) => player.playerId),
              ...booking.team2.map((player: any) => player.playerId),
            ],
            groupAdmin: [booking.userId],
            messages: [],
            isActive: true,
          });
        }

        // Create notification for booking owner
        await createNotification(
          {
            recipientId: booking.userId,
            senderId: transaction.userId,
            type: "PAYMENT_SUCCESSFUL",
            title: "Payment Successful",
            message: `Your payment of ₹${transaction.amount} for booking has been successfully processed using playcoins.`,
            category: "PAYMENT",
            referenceId: booking._id,
            referenceType: "bookings",
          },
          { session }
        );
      }

      await session.commitTransaction();

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

          // Create notification for booking owner
          await createNotification(
            {
              recipientId: booking.userId,
              senderId: transaction.userId,
              type: "PAYMENT_SUCCESSFUL",
              title: "Payment Successful",
              message: `Your payment of ₹${transaction.amount} for booking has been successfully processed using playcoins.`,
              category: "PAYMENT",
              referenceId: booking._id,
              referenceType: "bookings",
            },
            { session }
          );
        }

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
    }

    await session.abortTransaction();
    return errorResponseHandler(
      "Invalid payment method",
      httpStatusCode.BAD_REQUEST,
      res
    );
  } catch (error) {
    await session.abortTransaction();
    console.error("Error in payment booking service:", error);
    throw error;
  } finally {
    await session.endSession();
  }
};

export const modifyBookingServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const bookingId = req.params.id;
  const {
    team1,
    team2,
    bookingSlots,
    askToJoin,
    isCompetitive,
    skillRequired,
    bookingDate,
  } = req.body;

  const booking = await bookingModel.findById(bookingId).lean();

  if (!booking) {
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (!booking.bookingPaymentStatus) {
    return errorResponseHandler(
      "Payment not completed for this booking",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (booking.userId.toString() !== userData.id.toString()) {
    return errorResponseHandler(
      "You are not authorized to modify this booking",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  if (booking.bookingDate < new Date()) {
    return errorResponseHandler(
      "You cannot modify a booking that has already started or passed",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if booking slot is already taken by another booking
  if (bookingSlots && bookingSlots !== booking.bookingSlots) {
    const existingBooking = await bookingModel.findOne({
      venueId: booking.venueId,
      courtId: booking.courtId,
      bookingDate: bookingDate || booking.bookingDate,
      bookingSlots: bookingSlots,
      _id: { $ne: bookingId }, // Exclude current booking
    });

    if (existingBooking) {
      return errorResponseHandler(
        `Booking slot ${bookingSlots} is already taken`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Get all existing player IDs from the original booking
  interface PlayerInfo {
    playerPayment: number;
    paymentStatus: string;
    transactionId: mongoose.Types.ObjectId;
    paidBy: string;
  }

  interface Player {
    playerId?: mongoose.Types.ObjectId;
    playerPayment?: number;
    paymentStatus?: string;
    transactionId?: mongoose.Types.ObjectId;
    paidBy?: string;
    playerType?: string;
  }

  const existingPlayerIds: string[] = [
    ...(booking.team1 || [])
      .map((player: Player) => player.playerId?.toString())
      .filter(Boolean),
    ...(booking.team2 || [])
      .map((player: Player) => player.playerId?.toString())
      .filter(Boolean),
  ];

  // Create a map of existing players with their payment info
  const existingPlayersMap: { [key: string]: PlayerInfo } = {};
  [...(booking.team1 || []), ...(booking.team2 || [])].forEach((player) => {
    if (player.playerId) {
      existingPlayersMap[player.playerId.toString()] = {
        playerPayment: player.playerPayment,
        paymentStatus: player.paymentStatus,
        transactionId: player.transactionId,
        paidBy: player.paidBy,
      };
    }
  });

  // Check if any new players are being added
  interface Player {
    playerId?: mongoose.Types.ObjectId;
    playerType?: string;
  }

  const newTeam1PlayerIds: string[] = (team1 || [])
    .map((player: Player) => player.playerId?.toString())
    .filter(Boolean);
  const newTeam2PlayerIds: string[] = (team2 || [])
    .map((player: Player) => player.playerId?.toString())
    .filter(Boolean);
  const allNewPlayerIds = [...newTeam1PlayerIds, ...newTeam2PlayerIds];

  // Check if any new players are being added
  const newPlayers = allNewPlayerIds.filter(
    (id) => !existingPlayerIds.includes(id)
  );
  if (newPlayers.length > 0) {
    return errorResponseHandler(
      "Cannot add new players to an existing booking. Only existing players can be shuffled.",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Process teams to ensure players are in correct teams based on playerType
  // and preserve payment information
  interface Player {
    playerId?: mongoose.Types.ObjectId;
    playerType?: string;
    [key: string]: any;
  }

  interface ExistingPlayerInfo {
    playerPayment: number;
    paymentStatus: string;
    transactionId: mongoose.Types.ObjectId;
    paidBy: string;
  }

  let processedTeam1: Player[] = (team1 || []).map((player: Player) => {
    if (player.playerId) {
      const existingInfo: ExistingPlayerInfo =
        existingPlayersMap[player.playerId.toString()];
      return {
        ...player,
        playerPayment: existingInfo.playerPayment,
        paymentStatus: existingInfo.paymentStatus,
        transactionId: existingInfo.transactionId,
        paidBy: existingInfo.paidBy,
      };
    }
    return player;
  });

  let processedTeam2: Player[] = (team2 || []).map((player: Player) => {
    if (player.playerId) {
      const existingInfo: ExistingPlayerInfo =
        existingPlayersMap[player.playerId.toString()];
      return {
        ...player,
        playerPayment: existingInfo.playerPayment,
        paymentStatus: existingInfo.paymentStatus,
        transactionId: existingInfo.transactionId,
        paidBy: existingInfo.paidBy,
      };
    }
    return player;
  });

  // Move players to correct teams based on playerType
  const allPlayers = [...processedTeam1, ...processedTeam2];
  processedTeam1 = [];
  processedTeam2 = [];

  allPlayers.forEach((player) => {
    if (player.playerType === "player1" || player.playerType === "player2") {
      processedTeam1.push(player);
    } else if (
      player.playerType === "player3" ||
      player.playerType === "player4"
    ) {
      processedTeam2.push(player);
    }
  });

  const updatedBooking = await bookingModel.findByIdAndUpdate(
    bookingId,
    {
      team1: processedTeam1,
      team2: processedTeam2,
      bookingSlots,
      bookingDate: bookingDate || booking.bookingDate,
      askToJoin,
      isCompetitive,
      skillRequired,
    },
    { new: true }
  );

  return {
    success: true,
    message: "Booking updated successfully",
    data: updatedBooking,
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

  // Start a MongoDB session for transaction consistency
  const session = await mongoose.startSession();

  await session.startTransaction();

  const booking = await bookingModel.findById(bookingId).lean();

  if (!booking) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if user is the booking creator
  if (booking.userId.toString() !== userData.id.toString()) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Only the booking creator can cancel this booking",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  // Check if askToJoin is false
  if (booking.askToJoin === true) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Cannot cancel a booking that is open for others to join",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find the transaction
  const userTransaction = await transactionModel
    .findOne({
      bookingId: { $in: [bookingId] },
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

  // Check if booking date is in the past
  const currentDate = new Date();
  if (booking.bookingDate < currentDate) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Cannot cancel a booking that has already passed",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Get the booking slot time
  const bookingSlot = booking.bookingSlots;
  const [slotHour, slotMinute] = bookingSlot
    .split(":")
    .map((num) => parseInt(num, 10));

  // Create a date object for the exact booking time
  const bookingTime = new Date(booking.bookingDate);
  bookingTime.setHours(slotHour, slotMinute || 0, 0, 0);

  // Calculate time difference in hours
  const timeDifferenceMs = bookingTime.getTime() - currentDate.getTime();
  const timeDifferenceHours = timeDifferenceMs / (1000 * 60 * 60);

  // Check if cancellation is at least 6 hours before the booking time
  if (timeDifferenceHours < 6) {
    await session.abortTransaction();
    return errorResponseHandler(
      "Bookings can only be cancelled at least 6 hours before the scheduled time",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Refund playcoins if used
  if (userTransaction.playcoinsUsed > 0) {
    await additionalUserInfoModel.findOneAndUpdate(
      { userId: userData.id },
      { $inc: { playCoins: userTransaction.playcoinsUsed } },
      { session }
    );
  }

  // Process Razorpay refund if applicable
  let refund;
  if (
    userTransaction.razorpayPaymentId &&
    userTransaction.amount - userTransaction.playcoinsUsed > 0
  ) {
    try {
      refund = await razorpayInstance.payments.refund(
        userTransaction.razorpayPaymentId,
        {
          amount: Math.round(
            (userTransaction.amount - userTransaction.playcoinsUsed) * 100
          ), // Convert to paise and ensure it's an integer
          notes: {
            bookingId: bookingId,
            userId: userData.id.toString(),
            reason: "Booking creator cancelled booking",
          },
        }
      );
    } catch (razorpayError: any) {
      console.error("Razorpay refund error:", razorpayError);
      await session.abortTransaction();
      return errorResponseHandler(
        razorpayError.error?.description || "Failed to process refund",
        httpStatusCode.INTERNAL_SERVER_ERROR,
        res
      );
    }
  }

  // Update transaction status
  await transactionModel.findByIdAndUpdate(
    userTransaction._id,
    {
      status: "refunded",
      isWebhookVerified: true,
      razorpayRefundId: refund ? refund.id : null,
      refundAmount: userTransaction.amount - userTransaction.playcoinsUsed,
      refundDate: new Date(),
    },
    { session }
  );

  // Update booking status
  await bookingModel.findByIdAndUpdate(
    bookingId,
    {
      cancellationReason: "Creator cancelled booking",
      bookingType: "Cancelled",
    },
    { session }
  );

  // Create notification for the booking creator
  // await createNotification(
  //   {
  //     recipientId: userData.id,
  //     type: "BOOKING_CANCELLED",
  //     title: "Booking Cancelled",
  //     message: `Your booking has been cancelled successfully and a refund has been initiated.`,
  //     category: "BOOKING",
  //     referenceId: bookingId,
  //     referenceType: "bookings",
  //   },
  //   { session }
  // );

  // Notify all players in the booking about the cancellation
  const playerIds = new Set<string>();

  // Collect player IDs from both teams
  booking.team1?.forEach((player: any) => {
    if (
      player.playerId &&
      player.playerId.toString() !== userData.id.toString()
    ) {
      playerIds.add(player.playerId.toString());
    }
  });

  booking.team2?.forEach((player: any) => {
    if (
      player.playerId &&
      player.playerId.toString() !== userData.id.toString()
    ) {
      playerIds.add(player.playerId.toString());
    }
  });

  // Send notifications to all players
  // const notificationPromises = Array.from(playerIds).map((playerId) => {
  //   return createNotification(
  //     {
  //       recipientId: new mongoose.Types.ObjectId(playerId),
  //       senderId: userData.id,
  //       type: "BOOKING_CANCELLED",
  //       title: "Booking Cancelled",
  //       message: `A booking you were part of has been cancelled by the creator.`,
  //       category: "BOOKING",
  //       referenceId: bookingId,
  //       referenceType: "bookings",
  //     },
  //     { session }
  //   );
  // });

  // await Promise.all(notificationPromises);

  await session.commitTransaction();

  return {
    success: true,
    message: "Booking cancelled successfully",
    data: {
      bookingId,
      refundId: refund?.id,
      refundAmount: userTransaction.amount - userTransaction.playcoinsUsed,
      playcoinsRefunded: userTransaction.playcoinsUsed,
    },
  };
};
