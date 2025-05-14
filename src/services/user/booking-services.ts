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

  let paidFor: any[] = [];

  // ********************Validations****************************

  const bookingPrice: number = 600,
    completeCourtPrice: number = 1200,
    playerPayment: number = 300;

  // Process all players to set payment information
  [...team1, ...team2].forEach((item) => {
    if (item.playerId && item.playerId === userData.id) {
      item.paidBy = "Self";
      if (item.playerType) {
        paidFor.push(item.playerType);
      }
    } else if (item.playerId && item.playerId !== userData.id) {
      item.paidBy = "User";
      item.playerPayment = playerPayment;
      if (item.playerType) {
        paidFor.push(item.playerType);
      }
    }
  });

  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    
    // Create the transaction first
    const bookingTransaction = await transactionModel.create(
      [
        {
          userId: userData.id,
          paidFor: paidFor,
          amount:
            bookingType === "Complete"
              ? completeCourtPrice * bookingSlots.length
              : bookingPrice * bookingSlots.length,
          currency: "INR",
          status: "created",
          method: "razorpay",
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
      };
    });

    // Insert the bookings
    const bookings = await bookingModel.insertMany(finalPayload, { session });
    
    // Get all booking IDs
    const bookingIds = bookings.map(booking => booking._id);
    
    // Update the transaction with the booking IDs
    await transactionModel.findByIdAndUpdate(
      bookingTransaction[0]._id,
      { bookingId: bookingIds[0] }, // Store the first booking ID in the transaction
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message: "Court booking initiated",
      data: {
        transaction: {
          ...bookingTransaction[0].toObject(),
          bookingId: bookingIds[0]
        },
        bookings: bookings
      }
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
  } = req.body;

  // Find the booking with more details
  const booking = await bookingModel
    .findOne({
      _id: bookingId,
      askToJoin: true,
      bookingDate: { $gte: new Date() },
    })
    .lean();

  if (!booking) {
    return errorResponseHandler(
      "Booking not found",
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
    return errorResponseHandler(
      "You have already requested this position",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Create the booking request
  const requestData = {
    bookingId,
    requestedBy: userData.id,
    requestedTo: booking.userId,
    requestedTeam,
    requestedPosition,
    status: "pending",
    racketA: racketA || 0,
    racketB: racketB || 0,
    racketC: racketC || 0,
    balls: balls || 0,
    playerPayment: 300,
    paymentStatus: "Pending",
  };

  const data = await bookingRequestModel.create(requestData);

  // Create notification for the booking owner
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

  return {
    success: true,
    message: "Request to join the game sent successfully",
    data: data,
  };
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
  const bookingId = req.body.bookingId;

  if (!bookingId) {
    return errorResponseHandler(
      "Booking ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find the booking
  const booking = await bookingModel.findById(bookingId);
  
  if (!booking) {
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  
  if (booking.bookingPaymentStatus) {
    return errorResponseHandler(
      "Payment already completed for this booking",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  
  // Find transaction associated with this booking
  let transaction: any = await transactionModel.findOne({ bookingId: bookingId });
  
  // If no transaction exists, create one
  if (!transaction) {
    // Extract transaction ID from team members if available
    let transactionId = null;
    
    // Check team1 for transaction ID
    for (const player of booking.team1 || []) {
      if (player.transactionId) {
        transactionId = player.transactionId;
        break;
      }
    }
    
    // If not found in team1, check team2
    if (!transactionId) {
      for (const player of booking.team2 || []) {
        if (player.transactionId) {
          transactionId = player.transactionId;
          break;
        }
      }
    }
    
    // If transaction ID found, get the transaction
    if (transactionId) {
      transaction = await transactionModel.findById(transactionId);
    }
    
    // If still no transaction, create a new one
    if (!transaction) {
      transaction = await transactionModel.create({
        userId: booking.userId,
        bookingId: bookingId,
        amount: booking.bookingAmount,
        currency: "INR",
        status: "created",
        method: "razorpay",
        isWebhookVerified: false
      });
    }
  }
  
  // Update transaction with payment details
  const updatedTransaction = await transactionModel.findByIdAndUpdate(
    transaction._id,
    {
      razorpayPaymentId: req.body.razorpayPaymentId || "123456",
      razorpaySignature: req.body.razorpaySignature || "123456",
      razorpayOrderId: req.body.razorpayOrderId || "123456",
      status: "captured",
      isWebhookVerified: true
    },
    { new: true }
  );
  
  // Prepare updates for team1 players
  const updateOperations: any = { bookingPaymentStatus: true };
  
  // Update team1 players' payment status
  booking.team1.forEach((player : any, index : any) => {
    if (player.transactionId && 
        player.transactionId.toString() === transaction._id.toString()) {
      updateOperations[`team1.${index}.paymentStatus`] = "Paid";
    }
  });
  
  // Update team2 players' payment status
  booking.team2.forEach((player : any, index : any) => {
    if (player.transactionId && 
        player.transactionId.toString() === transaction._id.toString()) {
      updateOperations[`team2.${index}.paymentStatus`] = "Paid";
    }
  });
  
  // Update booking with all changes
  const updatedBooking = await bookingModel.findByIdAndUpdate(
    bookingId,
    { $set: updateOperations },
    { new: true }
  );
  
  return {
    success: true,
    message: "Payment completed successfully",
    data: {
      transaction: updatedTransaction,
      booking: updatedBooking
    }
  };
};
