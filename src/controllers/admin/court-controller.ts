import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { Request, Response } from "express";
import { courtModel } from "src/models/venue/court-schema";
import { venueModel } from "src/models/venue/venue-schema";

export const createUpdateCourt = async (req: Request, res: Response) => {
  try {
    const checkVenue = await venueModel.findById(req.body.venueId);
    if (!checkVenue) {
      return res
        .status(httpStatusCode.NOT_FOUND)
        .json({ success: false, message: "Venue not found" });
    }
    let response = {}
    let data: object = {};
    if (req.body.id) {
      const result = await courtModel.findByIdAndUpdate(req.body.id, req.body, {
        new: true,
      });
      data = result ?? {};
      response = {
        success: true,
        message: "Court updated successfully",
        data,
      };
    } else {
      data = await courtModel.create(req.body);
      response = {
        success: true,
        message: "Court created successfully",
        data,
      };
    }

    return res.status(httpStatusCode.CREATED).json(response);

  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

