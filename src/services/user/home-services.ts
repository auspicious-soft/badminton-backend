import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { venueModel } from "src/models/venue/venue-schema";
import { httpStatusCode } from "src/lib/constant";

export const userHomeServices = async (req: Request, res: Response) => {
  let nearbyVenues = [];
  const { nearBy } = req.body;

  if (
    req?.body?.location?.coordinates &&
    req.body.location.coordinates.length === 2
  ) {
    const [lng, lat] = req.body.location.coordinates;

    const geoNearStage: any = {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distance",
        spherical: true,
      },
    };

    if (nearBy !== false) {
      geoNearStage.$geoNear.maxDistance = 30000;
    }

    const pipeline: any[] = [
      geoNearStage,
      {
        $match: {
          isActive: true,
        },
      },
      {
        $project: {
          name: 1,
          city: 1,
          state: 1,
          image: 1,
          distance: {
            $round: [{ $divide: ["$distance", 1000] }, 1],
          },
          weather: 1,
        },
      },
    ];

    nearbyVenues = await venueModel.aggregate(pipeline);
  } else {
    nearbyVenues = await venueModel
      .find({ isActive: true })
      .select("name city state image weather")
      .lean();
  }

  const data = {
    banners: [],
    upcomingMatches: [],
    venueNearby: nearbyVenues,
    playersRanking: [],
    loyaltyPoints: { points: 0, level: 0, totalLevels: 5 },
  };

  return {
    success: true,
    message: "User home data retrieved successfully",
    data,
  };
};

export const getVenuesServices = async (req: Request, res: Response) => {
  let nearbyVenues = [];
  const { date, distance, game, location } = req.body;

  if (!date || !distance || !game || !location?.coordinates?.length) {
    return errorResponseHandler(
      "Invalid Payload",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (
    req?.body?.location?.coordinates &&
    req.body.location.coordinates.length === 2
  ) {
    const [lng, lat] = req.body.location.coordinates;

    const geoNearStage: any = {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distance",
        spherical: true,
        maxDistance: 3000000,
      },
    };

    const matchStage: any = {
      isActive: true,
    };

    if (game !== "all") {
      matchStage.gamesAvailable = { $in: [game] };
    }

    const pipeline: any[] = [
      geoNearStage,
      {
        $match: matchStage,
      },
      {
        $project: {
          name: 1,
          city: 1,
          state: 1,
          image: 1,
          courts: {
            $filter: {
              input: "$courts",
              as: "court",
              cond: { $eq: ["$$court.isActive", true] },
            },
          },
          distance: {
            $round: [{ $divide: ["$distance", 1000] }, 1],
          },
          weather: 1,
        },
      },
      {
        $sort: {
          distance: distance === "ASC" ? 1 : -1,
        },
      },
    ];

    nearbyVenues = await venueModel.aggregate(pipeline);
  }

  return {
    success: true,
    message: "User home data retrieved successfully",
    data: nearbyVenues,
  };
};


export const getCourtsServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { venueId } = req.body;
  if (!venueId)
    return errorResponseHandler(
      "Venue ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const venueData = await venueModel
    .findById(venueId)
    .select("-location -employees ")
    .lean();
  if (!venueData)
    return errorResponseHandler(
      "Venue not found",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const data = venueData;

  return {
    success: true,
    message: "Courts retrieved successfully",
    data: data,
  };
};

export const bookCourtServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const { venueId } = req.body;
  if (!venueId)
    return errorResponseHandler(
      "Venue ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );

  return {
    success: true,
    message: "Courts retrieved successfully",
    data: {},
  };
};
