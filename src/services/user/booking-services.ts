import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { bookingModel } from "../../models/venue/booking-schema";
import { bookingRequestModel } from "../../models/venue/booking-request-schema";
import { transactionModel } from "src/models/admin/transaction-schema";
import mongoose from "mongoose";

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
  let paidFor :any[] = []

  // ********************Validattions****************************

  const bookingPrice: number = 600 ,
    completeCourtPrice: number = 1200,
    playerPayment: number = 300;

  [...team1, ...team2].map((items,indx)=>{
    if(items.playerId && items.playerId === userData.id){
      items.paidBy = "Self";
      items.playerType = playerType[indx];
      paidFor.push(playerType[indx]);
    }
    if(items.playerId && items.playerId !== userData.id){
      items.paidBy = "User";
      items.playerPayment = playerPayment;
      items.playerType = playerType[indx];
      paidFor.push(playerType[indx]);
    }
  })

  const session = await mongoose.startSession();

  let bookingPayload = {
    userId: userData.id,
    venueId,
    courtId,
    gameType,
    askToJoin,
    isCompetitive,
    skillRequired,
    team1,
    team2,
    bookingType,
    bookingAmount: bookingType === "Complete" ? completeCourtPrice : bookingPrice,
    bookingPaymentStatus: false,
    bookingDate,
    bookingSlots,
  }

  let finalPayload = bookingSlots.map((slot: string)=>{
    return {
      ...bookingPayload,
      bookingSlots : slot,
    }
  })

  try {
    await session.startTransaction();
    const bookingTransaction = await transactionModel.create([{
      userId: userData.id,
      paidFor: paidFor,
      amount: bookingType === "Complete" ? completeCourtPrice * bookingSlots.length : bookingPrice * bookingSlots.length,
      currency: "INR",
      status: "created",
      method: "razorpay",
      notes: bookingSlots,
      isWebhookVerified: false,
    }], { session });

    finalPayload.map((items: any)=>{
      items.transactionId = bookingTransaction[0]._id;
    })

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
  const { bookingId, requestedPosition, requestedTeam } = req.body;

  const booking = await bookingModel.findOne({
    _id: bookingId,
    gameType: "Public",
    bookingDate: { $gte: new Date() },
  });

  console.log(booking);

  if (!booking) {
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Court booking initiated",
    res,
  };
};

export const createBookingRequestService = async (
  req: Request,
  res: Response
) => {
  const userData = req.user as any;
  const {
    bookingId,
    requestedTeam,
    requestedPosition,
    rentedRacket = 0,
    rentedBalls = 0,
  } = req.body;

  try {
    // Validate required fields
    if (!bookingId || !requestedTeam || !requestedPosition) {
      return errorResponseHandler(
        "Required fields missing",
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

    // Check if booking is public
    if (booking.gameType !== "Public") {
      return errorResponseHandler(
        "Cannot join private bookings",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if the requested position is already taken
    const team = (booking as any)[requestedTeam] as any[];
    const positionTaken = team.some(
      (player) => player.playerType === requestedPosition && player.playerId
    );

    if (positionTaken) {
      return errorResponseHandler(
        "Position already taken",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Calculate player payment
    const individualPrice = 400;
    const racketRentPrice = 100;
    const ballRentPrice = 50;

    const playerPayment =
      individualPrice +
      rentedRacket * racketRentPrice +
      rentedBalls * ballRentPrice;

    // Create booking request with appropriate status
    const requestData = {
      bookingId,
      requestedBy: userData.id,
      requestedTeam,
      requestedPosition,
      rentedRacket,
      rentedBalls,
      playerPayment,
      status: booking.askToJoin ? "pending" : "completed",
    };

    const bookingRequest = await bookingRequestModel.create(requestData);

    // If askToJoin is false, directly update the booking
    if (!booking.askToJoin) {
      const playerData = {
        playerId: userData.id,
        playerType: requestedPosition,
        playerPayment,
        paymentStatus: "Pending",
        rentedRacket,
        rentedBalls,
      };

      // Update the booking with the new player
      const updateQuery = {
        $set: {},
      } as any;

      // Find the index where to insert the new player
      const bookingTyped = booking as any;
      const teamArray = bookingTyped[requestedTeam] as any[];
      const playerIndex = teamArray.findIndex(
        (p) => p.playerType === requestedPosition
      );

      updateQuery.$set[`${requestedTeam}.${playerIndex}`] = playerData;

      await bookingModel.findByIdAndUpdate(bookingId, updateQuery, {
        new: true,
      });
    }

    return {
      success: true,
      message: booking.askToJoin
        ? "Booking request created successfully"
        : "Joined booking successfully",
      data: bookingRequest,
    };
  } catch (error: any) {
    // Handle duplicate request error
    if (error.code === 11000) {
      return errorResponseHandler(
        "You have already requested this position",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    return errorResponseHandler(
      error.message || "Error creating booking request",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const handleBookingRequestService = async (
  req: Request,
  res: Response
) => {
  const userData = req.user as any;
  const { requestId, action } = req.body;

  try {
    if (!requestId || !action || !["accept", "reject"].includes(action)) {
      return errorResponseHandler(
        "Invalid request parameters",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const bookingRequest = await bookingRequestModel.findById(requestId);
    if (!bookingRequest) {
      return errorResponseHandler(
        "Booking request not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const booking = await bookingModel.findById(bookingRequest.bookingId);
    if (!booking) {
      return errorResponseHandler(
        "Booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Verify if the current user is the booking creator
    if (booking.userId.toString() !== userData.id) {
      return errorResponseHandler(
        "Unauthorized to handle this request",
        httpStatusCode.UNAUTHORIZED,
        res
      );
    }

    if (action === "accept") {
      // Update booking request status
      bookingRequest.status = "accepted";
      await bookingRequest.save();

      // Create player data
      const playerData = {
        playerId: bookingRequest.requestedBy,
        playerType: bookingRequest.requestedPosition,
        playerPayment: bookingRequest.playerPayment,
        paymentStatus: "Pending",
        rentedRacket: bookingRequest.rentedRacket,
        rentedBalls: bookingRequest.rentedBalls,
      };

      // Update the booking with the new player
      const updateQuery = {
        $set: {},
      } as any;

      const teamArray = booking[bookingRequest.requestedTeam] as any[];
      const playerIndex = teamArray.findIndex(
        (p) => p.playerType === bookingRequest.requestedPosition
      );

      updateQuery.$set[`${bookingRequest.requestedTeam}.${playerIndex}`] =
        playerData;

      await bookingModel.findByIdAndUpdate(
        bookingRequest.bookingId,
        updateQuery
      );

      return {
        success: true,
        message: "Booking request accepted successfully",
        data: bookingRequest,
      };
    } else {
      // Reject the request
      bookingRequest.status = "rejected";
      await bookingRequest.save();

      return {
        success: true,
        message: "Booking request rejected successfully",
        data: bookingRequest,
      };
    }
  } catch (error: any) {
    return errorResponseHandler(
      error.message || "Error handling booking request",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};





