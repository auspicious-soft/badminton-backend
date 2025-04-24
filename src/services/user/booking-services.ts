import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { bookingModel } from "../../models/venue/booking-schema";
import { bookingRequestModel } from "../../models/venue/booking-request-schema";
import { transactionModel } from "src/models/admin/transaction-schema";
import mongoose from "mongoose";
import { createNotification, notificationModel } from "src/models/notification/notification-schema";

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

  let playerType = ["player1", "player2", "player3", "player4"];
  let paidFor: any[] = [];

  // ********************Validattions****************************

  const bookingPrice: number = 600,
    completeCourtPrice: number = 1200,
    playerPayment: number = 300;

  [...team1, ...team2].map((items, indx) => {
    if (items.playerId && items.playerId === userData.id) {
      items.paidBy = "Self";
      items.playerType = playerType[indx];
      paidFor.push(playerType[indx]);
    }
    if (items.playerId && items.playerId !== userData.id) {
      items.paidBy = "User";
      items.playerPayment = playerPayment;
      items.playerType = playerType[indx];
      paidFor.push(playerType[indx]);
    }
  });

  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
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
      bookingSlots,
    };

    let finalPayload = bookingSlots.map((slot: string) => {
      return {
        ...bookingPayload,
        bookingSlots: slot,
      };
    });

    await bookingModel.insertMany(finalPayload, { session });
    await session.commitTransaction();

    return {
      success: true,
      message: "Court booking initiated",
      data: bookingTransaction[0],
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
  const { bookingId, requestedPosition, racketA, racketB, racketC, balls } =
    req.body;

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

  if (
    [...booking.team1, ...booking.team2].some(
      (player) =>
        player.playerId == userData.id ||
        player.playerType === requestedPosition
    )
  ) {
    return errorResponseHandler(
      "You are already in this team or this position is occupied",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const requestedTeam =
    requestedPosition === "player1" || requestedPosition === "player2"
      ? "team1"
      : "team2";
  
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

  const requestData = {
    bookingId,
    requestedBy: userData.id,
    requestedTo: booking.userId,
    requestedTeam,
    requestedPosition,
    status: "pending",
    racketA,
    racketB,
    racketC,
    balls,
    playerPayment: 300,
  };

  const data = await bookingRequestModel.create(requestData);

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
    message: "Court booking initiated",
    data: data,
  };
};

export const userNotificationServices = async (
  req: Request,
  res: Response
) => {
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
