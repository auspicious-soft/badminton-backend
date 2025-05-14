import { Request, Response, NextFunction } from "express";
import { httpStatusCode, VENUE_TIME_SLOTS } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { bookingModel } from "src/models/venue/booking-schema";
import { venueModel } from "src/models/venue/venue-schema";
import { courtModel } from "src/models/venue/court-schema";

interface BookingRequestBody {
  venueId: string;
  courtId: string;
  bookingDate: string;
  bookingSlots: string[];
  gameType: "Public" | "Private";
  team1: Array<{
    playerId?: string;
    playerType?: string;
  }>;
  team2: Array<{
    playerId?: string;
    playerType?: string;
  }>;
  askToJoin?: boolean;
  isCompetitive?: boolean;
  skillRequired?: number;
  bookingType: "Booking" | "Complete";
}

export const validateBookingRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      venueId,
      courtId,
      bookingDate,
      bookingSlots,
      gameType,
      team1,
      team2,
      bookingType,
      skillRequired,
    } = req.body as BookingRequestBody;

    // Required fields validation
    if (!venueId || !courtId || !bookingDate || !bookingSlots?.length) {
      return errorResponseHandler(
        "Required fields missing: venueId, courtId, bookingDate, bookingSlots",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Date validation
    const currentDate = new Date();
    const bookingDateObj = new Date(bookingDate);

    if (isNaN(bookingDateObj.getTime())) {
      return errorResponseHandler(
        "Invalid booking date format",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (bookingDateObj < currentDate) {
      return errorResponseHandler(
        "Booking date cannot be in the past",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if booking already exists
    const existingBooking = await bookingModel.findOne({
      venueId,
      courtId,
      bookingDate: bookingDateObj,
      bookingSlots: { $in: bookingSlots },
      // bookingPaymentStatus: true,
    });

    if (existingBooking) {
      return errorResponseHandler(
        `Booking already exists for the selected slots ${existingBooking.bookingSlots}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Booking slots validation
    const sanitizedBookingSlots = Array.from(new Set(bookingSlots));

    if (sanitizedBookingSlots.length !== bookingSlots.length) {
      return errorResponseHandler(
        "Duplicate booking slots are not allowed",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!bookingSlots.every((slot) => VENUE_TIME_SLOTS.includes(slot))) {
      return errorResponseHandler(
        "Invalid booking slot format",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (bookingSlots.length > 2) {
      return errorResponseHandler(
        "Maximum 2 slots are allowed",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Team validation
    if (!Array.isArray(team1) || !Array.isArray(team2)) {
      return errorResponseHandler(
        "team1 and team2 must be arrays",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (team1.length > 2 || team2.length > 2) {
      return errorResponseHandler(
        "Maximum 2 players are allowed in each team",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const totalPlayers = [...team1, ...team2].filter(
      (player) => player.playerId
    ).length;

    if (totalPlayers < 2) {
      return errorResponseHandler(
        "At least 2 players are required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (totalPlayers > 4) {
      return errorResponseHandler(
        "Maximum 4 players are allowed",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Venue validation
    const venue = await venueModel.findById(venueId);
    if (!venue) {
      return errorResponseHandler(
        "Venue not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Court validation - now using separate court collection
    const court = await courtModel.findOne({
      _id: courtId,
      venueId: venueId
    });
    
    if (!court) {
      return errorResponseHandler(
        "Court not found for the specified venue",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Game type and booking type validation
    if (gameType && !["Public", "Private"].includes(gameType)) {
      return errorResponseHandler(
        "Invalid game type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!["Booking", "Complete"].includes(bookingType)) {
      return errorResponseHandler(
        "Invalid booking type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Skill validation
    if (skillRequired && (skillRequired < 0 || skillRequired > 100)) {
      return errorResponseHandler(
        "Skill required must be between 0 and 100",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    next();
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

