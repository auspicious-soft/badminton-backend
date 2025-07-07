import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { bookingModel } from "src/models/venue/booking-schema";
import { courtModel } from "src/models/venue/court-schema";
import { venueModel } from "src/models/venue/venue-schema";
import mongoose from "mongoose";

export const createMaintenanceBooking = async (req: Request, res: Response) => {
  try {
    const adminData = req.user as any;
    const { courtId, venueId, bookingDate, bookingSlots, maintenanceReason } =
      req.body;

    if (
      !courtId ||
      !venueId ||
      !bookingDate ||
      !bookingSlots ||
      !maintenanceReason
    ) {
      return errorResponseHandler(
        "Required fields missing: courtId, venueId, bookingDate, bookingSlots, maintenanceReason",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate court and venue
    const court = await courtModel.findById(courtId);
    if (!court) {
      return errorResponseHandler(
        "Court not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const venue = await venueModel.findById(venueId);
    if (!venue) {
      return errorResponseHandler(
        "Venue not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if court belongs to venue
    if (court.venueId.toString() !== venueId) {
      return errorResponseHandler(
        "Court does not belong to the specified venue",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Convert bookingDate to Date object
    const bookingDateObj = new Date(bookingDate);
    bookingDateObj.setHours(0, 0, 0, 0);

    // Check if there are existing bookings for these slots
    const existingBookings = await bookingModel.find({
      courtId,
      venueId,
      bookingDate: bookingDateObj,
      bookingSlots: {
        $in: Array.isArray(bookingSlots) ? bookingSlots : [bookingSlots],
      },
      bookingPaymentStatus: true,
      // isMaintenance: false, // Only check for regular bookings
      bookingType: {$ne:"Cancelled"}
    });

    if (existingBookings.length > 0) {
      return errorResponseHandler(
        "There are existing bookings for some of these slots",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Create maintenance bookings (one for each slot)
    const maintenanceBookings = [];
    const slotsArray = Array.isArray(bookingSlots)
      ? bookingSlots
      : [bookingSlots];

    for (const slot of slotsArray) {
      const maintenanceBooking = await bookingModel.create({
        userId: adminData.id, // Using admin ID as the user ID
        venueId: new mongoose.Types.ObjectId(venueId),
        courtId: new mongoose.Types.ObjectId(courtId),
        gameType: "Private", // Default value
        bookingType: "Booking", // Default value
        bookingAmount: 0, // No charge for maintenance
        bookingPaymentStatus: true, // Mark as paid to block the slot
        bookingDate: bookingDateObj,
        bookingSlots: slot,
        isMaintenance: true,
        maintenanceReason,
        createdBy: new mongoose.Types.ObjectId(adminData.id),
      });

      maintenanceBookings.push(maintenanceBooking);
    }

    return res.status(httpStatusCode.CREATED).json({
      success: true,
      message: "Maintenance booking(s) created successfully",
      data: maintenanceBookings,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const getMaintenanceBookings = async (req: Request, res: Response) => {
  try {
    const { venueId, courtId, date, page = "1", limit = "10" } = req.query;

    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    const query: any = { isMaintenance: true };

    if (venueId) query.venueId = venueId;
    if (courtId) query.courtId = courtId;

    if (date) {
      const requestDate = new Date(date as string);
      requestDate.setHours(0, 0, 0, 0);

      const endOfDay = new Date(requestDate);
      endOfDay.setHours(23, 59, 59, 999);

      query.bookingDate = {
        $gte: requestDate,
        $lte: endOfDay,
      };
    }

    const total = await bookingModel.countDocuments(query);

    const maintenanceBookings = await bookingModel
      .find(query)
      .populate("courtId", "name games")
      .populate("venueId", "name city state")
      .populate("createdBy", "name email")
      .sort({ bookingDate: 1, bookingSlots: 1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Maintenance bookings retrieved successfully",
      data: maintenanceBookings,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        pages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const updateMaintenanceBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bookingDate, bookingSlots, maintenanceReason } = req.body;

    // Find the maintenance booking
    const maintenanceBooking = await bookingModel.findOne({
      _id: id,
      isMaintenance: true,
    });

    if (!maintenanceBooking) {
      return errorResponseHandler(
        "Maintenance booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check for existing bookings if changing date or slots
    if (
      (bookingDate &&
        bookingDate !==
          maintenanceBooking.bookingDate.toISOString().split("T")[0]) ||
      (bookingSlots && bookingSlots !== maintenanceBooking.bookingSlots)
    ) {
      const bookingDateObj = bookingDate
        ? new Date(bookingDate)
        : maintenanceBooking.bookingDate;
      bookingDateObj.setHours(0, 0, 0, 0);

      const existingBookings = await bookingModel.find({
        _id: { $ne: id }, // Exclude current booking
        courtId: maintenanceBooking.courtId,
        venueId: maintenanceBooking.venueId,
        bookingDate: bookingDateObj,
        bookingSlots: bookingSlots || maintenanceBooking.bookingSlots,
        bookingPaymentStatus: true,
      });

      if (existingBookings.length > 0) {
        return errorResponseHandler(
          "There is an existing booking for this slot",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }

    // Update maintenance booking
    const updatedBooking = await bookingModel
      .findByIdAndUpdate(
        id,
        {
          ...(bookingDate && { bookingDate: new Date(bookingDate) }),
          ...(bookingSlots && { bookingSlots }),
          ...(maintenanceReason && { maintenanceReason }),
        },
        { new: true }
      )
      .populate("courtId", "name games")
      .populate("venueId", "name city state")
      .populate("createdBy", "name email");

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Maintenance booking updated successfully",
      data: updatedBooking,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const deleteMaintenanceBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const maintenanceBooking = await bookingModel.findOne({
      _id: id,
      isMaintenance: true,
    });

    if (!maintenanceBooking) {
      return errorResponseHandler(
        "Maintenance booking not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    await bookingModel.findByIdAndDelete(id);

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Maintenance booking deleted successfully",
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const listOfVenues = async (req: Request, res: Response) => {
  try {
    const venues = await venueModel.find({ isActive: true }).select("name _id timeslots").lean();
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Venues retrieved successfully",
      data: venues,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const listOfCourts = async (req: Request, res: Response) => {
  try {
    const { venueId } = req.query;
    if (!venueId) {
      return errorResponseHandler(
        "Venue ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const courts = await courtModel.find({ venueId, isActive: true }).select("name _id games").lean();
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Courts retrieved successfully",
      data: courts,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};
