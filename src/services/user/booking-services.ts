import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { bookingModel } from "../../models/venue/booking-schema";
import { bookingRequestModel } from "../../models/venue/booking-request-schema";
import { venueModel } from "src/models/venue/venue-schema";

export const bookCourtServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const {
    venueId,
    courtId,
    bookingDate,
    bookingSlots,
    gameType,
    team1,
    team2 = [],
    bookedBy,
    askToJoin = false,
    isCompetitive = false,
    skillRequired = 0,
    bookingType,
  } = req.body;

  // Validate required fields
  if (!venueId || !courtId || !bookingDate || !bookingSlots || !gameType) {
    return errorResponseHandler(
      "Required fields missing: venueId, courtId, bookingDate, bookingSlots, gameType",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate team1 structure and required player1 field
  if (!Array.isArray(team1) || team1.length === 0) {
    return errorResponseHandler(
      "Team1 must be a non-empty array",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if the venue and court exist
  const venue = await venueModel.findById(venueId);
  if (!venue) {
    return errorResponseHandler(
      "Venue not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if the court exists in the venue
  const court = venue.courts.find((c: any) => c._id.toString() === courtId);
  if (!court) {
    return errorResponseHandler(
      "Court not found in the venue",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if the slot is already booked
  const existingBooking = await bookingModel.findOne({
    venueId,
    courtId,
    bookingDate,
    bookingSlots,
  });

  if (existingBooking) {
    return errorResponseHandler(
      "This slot is already booked",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const individualPrice: number = 400,
    bookingPrice: number = 800,
    completeCourtPrice: number = 1600
    
  try {
    if (gameType === "Public") {
      if(team1.length>1){
        return errorResponseHandler(
          "You are not allowed to book more than one player",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      team1[0].playerId = userData.id;
      team1[0].playerPayment = individualPrice;
      team1[0].paymentStatus = "Pending";
      team1[0].playerType = "player1"

      const booking = await bookingModel.create({
        userId: userData.id,
        venueId,
        courtId,
        bookingDate,
        bookingSlots,
        gameType,
        team1,
        team2,
        bookingAmount: individualPrice,
        askToJoin,
        isCompetitive,
        bookingType: "Self",
        skillRequired,
        bookingPaymentStatus: false,
      });

      return {
        success: true,
        message: "Court booking initiated",
        data: {
          bookingId: booking._id,
          bookingAmount: individualPrice,
          paidBy: bookedBy,
          players: { team1, team2 },
        },
      };
    } else {
      // Calculate booking amount for each player
      if (!bookingType) {
        return errorResponseHandler(
          "Booking type is required",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      const allPlayers = [...team1, ...team2];
      if (allPlayers.every((player: any) => !player.playerId)) {
        return errorResponseHandler(
          "At least one player is required in team1 or team2",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      [...team1, ...team2].forEach((player: any) => {
        player.paidBy = player.playerType === bookedBy ? "Self" : bookedBy;
      });

      let bookingAmount =
        bookingType === "Complete" ? completeCourtPrice : bookingPrice;

      const booking = await bookingModel.create({
        userId: userData.id,
        venueId,
        courtId,
        bookingDate,
        bookingSlots,
        gameType,
        team1,
        team2,
        bookingAmount,
        askToJoin,
        isCompetitive,
        bookingType,
        skillRequired,
        bookingPaymentStatus: false,
      });

      return {
        success: true,
        message: "Court booking initiated",
        data: {
          bookingId: booking._id,
          bookingAmount,
          paidBy: bookedBy,
          players: { team1, team2 },
        },
      };
    }
  } catch (error: any) {
    return errorResponseHandler(
      error.message || "Error creating booking",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
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

  console.log(booking)

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
    res
  }
}


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
