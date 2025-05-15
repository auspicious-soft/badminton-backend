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

  let paidForPlayers: mongoose.Types.ObjectId[] = [];

  // ********************Validations****************************

  const bookingPrice: number = 600,
    completeCourtPrice: number = 1200,
    playerPayment: number = 300;

  // Process all players to set payment information and collect player IDs for paidFor
  [...team1, ...team2].forEach((item) => {
    if (item.playerId) {
      if (item.playerId === userData.id) {
        item.paidBy = "Self";
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
  const transactionId = req.body.transactionId;

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

  // Get all booking IDs from the transaction
  const bookingIds = transaction.bookingId || [];

  if (bookingIds.length === 0) {
    return errorResponseHandler(
      "No bookings associated with this transaction",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Start a session for transaction consistency
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Update the transaction with payment details
    const updatedTransaction = await transactionModel.findByIdAndUpdate(
      transactionId,
      {
        razorpayPaymentId: req.body.razorpayPaymentId || "dummy_payment_id",
        razorpaySignature: req.body.razorpaySignature || "dummy_signature",
        razorpayOrderId: req.body.razorpayOrderId || "dummy_order_id",
        status: "captured",
        isWebhookVerified: true,
      },
      { new: true, session }
    );

    // Get all bookings that need to be updated
    const bookings = await bookingModel.find({ _id: { $in: bookingIds } });

    // Update each booking
    const updatedBookings = await Promise.all(
      bookings.map(async (booking) => {
        // Prepare updates for team players
        const updateOperations: any = { bookingPaymentStatus: true };

        // Get the player IDs that were paid for
        const paidForPlayerIds =
          updatedTransaction?.paidFor?.map((id) => id.toString()) || [];

        // Update team1 players' payment status
        booking.team1.forEach((player: any, index: number) => {
          if (
            player.playerId &&
            paidForPlayerIds.includes(player.playerId.toString())
          ) {
            updateOperations[`team1.${index}.paymentStatus`] = "Paid";
          }
        });

        // Update team2 players' payment status
        booking.team2.forEach((player: any, index: number) => {
          if (
            player.playerId &&
            paidForPlayerIds.includes(player.playerId.toString())
          ) {
            updateOperations[`team2.${index}.paymentStatus`] = "Paid";
          }
        });

        // Update the booking
        return await bookingModel.findByIdAndUpdate(
          booking._id,
          { $set: updateOperations },
          { new: true, session }
        );
      })
    );

    await session.commitTransaction();

    return {
      success: true,
      message: "Payment completed successfully",
    };
  } catch (error) {
    await session.abortTransaction();
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
