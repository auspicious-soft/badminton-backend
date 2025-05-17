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
import { getCurrentISTTime } from "../../utils";

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

    // Get current time in IST
    const currentDate = getCurrentISTTime();
    
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
      
      const bookings = await bookingModel
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
        .lean();
      
      // Get all player IDs from both teams
      const playerIds = new Set<string>();
      bookings.forEach(booking => {
        booking.team1?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
        booking.team2?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
      });
      
      // Get player data
      const players = await mongoose.model('users').find({
        _id: { $in: Array.from(playerIds) },
      })
      .select("_id fullName profilePic")
      .lean();
      
      // Create a map of players by ID for quick lookup
      const playersMap = players.reduce((map, player: any) => {
        map[player._id.toString()] = player;
        return map;
      }, {} as Record<string, any>);
      
      // Process bookings to include player data
      const processedBookings = bookings.map(booking => {
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
        
        return {
          ...booking,
          team1: team1WithPlayerData,
          team2: team2WithPlayerData,
        };
      });
      
      response.data = processedBookings;
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
        .lean();
      
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
        .lean();
      
      // Get all player IDs from both previous and current bookings
      const playerIds = new Set<string>();
      [...previous, ...current].forEach(booking => {
        booking.team1?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
        booking.team2?.forEach((player: any) => {
          if (player.playerId) playerIds.add(player.playerId.toString());
        });
      });
      
      // Get player data
      const players = await mongoose.model('users').find({
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
          const score = await gameScoreModel.findOne({ bookingId: booking._id }).lean() || {};
          
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
          const score = await gameScoreModel.findOne({ bookingId: booking._id }).lean() || {};
          
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
        current: processedCurrent 
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
