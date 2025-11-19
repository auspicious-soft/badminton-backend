import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { Request, Response } from "express";
import { courtModel } from "src/models/venue/court-schema";
import { venueModel } from "src/models/venue/venue-schema";

export const createUpdateCourt = async (req: Request, res: Response) => {
  try {
    const checkVenue = await venueModel.findById(req.body.venueId).lean();
    if (!checkVenue) {
      return res
        .status(httpStatusCode.NOT_FOUND)
        .json({ success: false, message: "Venue not found" });
    }
    let response = {};
    let data: object = {};

    if (req.body.id) {
      const checkExistingCourt = await courtModel.findById(req.body.id).lean();
      if (!checkExistingCourt) {
        return res
          .status(httpStatusCode.NOT_FOUND)
          .json({ success: false, message: "Court not found" });
      }

      let rateObject: any = {};

      if (req.body.hourlyRate) {
        checkVenue.timeslots?.forEach((slot: string) => {
          rateObject[slot] = req.body.hourlyRate || 0;
        });
      } else {
        rateObject = checkExistingCourt.hourlyRate || {};
      }

      req.body.hourlyRate = rateObject;

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
      let rateObject: any = {};
      checkVenue.timeslots?.forEach((slot: string) => {
        rateObject[slot] = req.body.hourlyRate || 0;
      });
      req.body.hourlyRate = rateObject;
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
