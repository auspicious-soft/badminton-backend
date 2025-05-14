import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { bookingModel } from "src/models/venue/booking-schema";
import { gameScoreModel } from "src/models/venue/game-score";
import { object } from "webidl-conversions";

export const getMyMatches = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;

    const { type } = req.query;
    let response: any = {
      success: true,
      message: "Matches retrieved successfully",
      data: [],
    };

    if (type !== "upcoming" && type !== "current") {
      return errorResponseHandler(
        "Invalid Type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Get current time in IST (UTC+5:30)
    const now = new Date();
    const utcTime = now.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours and 30 minutes in milliseconds
    const currentDate = new Date(utcTime + istOffset);
    
    console.log(`Current IST time: ${currentDate.toISOString()}`);

    // Create a query based on the type
    let query: any = {
      $or: [
        { "team1.playerId": userData.id },
        { "team2.playerId": userData.id },
      ],
      bookingPaymentStatus: true,
    };

    if (type === "upcoming") {
      query.bookingDate = { $gt: currentDate };
    } else if (type === "current") {
      query.bookingDate = { $lte: currentDate };
    }

    if (type === "upcoming") {
      const data = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingDate: { $gte: new Date() },
        })
        .populate({
          path: "venueId",
          select: "name city state address",
        })
        .populate({
          path: "courtId",
          select: "games",
        })
        .select(
          "team1 team2 bookingDate bookingSlots isCompetitive skillRequired gameType"
        )
        .lean();

      response.data = data;
    } else {
      const previous = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingDate: { $lt: new Date() },
        })
        .populate({
          path: "venueId",
          select: "name city state address",
        })
        .populate({
          path: "courtId",
          select: "games",
        })
        .select(
          "team1 team2 bookingDate bookingSlots isCompetitive skillRequired gameType"
        )
        .lean();

      // Use Promise.all to wait for all async operations to complete
      const previousWithScores = await Promise.all(
        previous.map(async (item) => {
          const score = await gameScoreModel.findOne({ bookingId: item._id }).lean() || {};
          return { ...item, score };
        })
      );

      const current = await bookingModel
        .find({
          $or: [
            { "team1.playerId": new mongoose.Types.ObjectId(userData.id) },
            { "team2.playerId": new mongoose.Types.ObjectId(userData.id) },
          ],
          bookingDate: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        })
        .populate({
          path: "venueId",
          select: "name city state address",
        })
        .populate({
          path: "courtId",
          select: "games",
        })
        .select(
          "team1 team2 bookingDate bookingSlots isCompetitive skillRequired gameType"
        )
        .lean();

      // Use Promise.all to wait for all async operations to complete
      const currentWithScores = await Promise.all(
        current.map(async (item) => {
          const score = await gameScoreModel.findOne({ bookingId: item._id }).lean() || {};
          return { ...item, score };
        })
      );

      response.data = { 
        previous: previousWithScores, 
        current: currentWithScores 
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

export const uploadScore = async (req: Request, res: Response) => {
  try {
    const { bookingId, ...restData } = req.body;
    console.log(bookingId);

    const checkExist = await bookingModel.findById(bookingId);
    if (!checkExist) {
      return errorResponseHandler(
        "Booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const checkScoreExist = await gameScoreModel.findOne({ bookingId });
    let response: any = {
      success: true,
      message: "Score uploaded successfully",
      data: [],
    };

    if (checkScoreExist) {
      const data = await gameScoreModel.findByIdAndUpdate(
        checkScoreExist._id,
        restData,
        { new: true }
      );
      response.data = data;
    } else {
      const data = await gameScoreModel.create({ bookingId, ...restData });
      response.data = data;
    }

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
