import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import mongoose, { PipelineStage } from "mongoose";
import { priceModel } from "src/models/admin/price-schema";
import { adminSettingModel } from "src/models/admin/admin-settings";
import { notificationModel } from "src/models/notification/notification-schema";
import { usersModel } from "src/models/user/user-schema";
import { notifyUser } from "src/utils/FCM/FCM";
import { playcoinModel } from "src/models/admin/playcoin-schema";

// Create or update pricing
export const createUpdatePricing = async (req: Request, res: Response) => {
  try {
    const { id, name, description, dayType, slotPricing } = req.body;

    // Validate required fields
    if (!name || !dayType || !slotPricing) {
      return errorResponseHandler(
        "Name, dayType, and slotPricing are required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate dayType
    if (!["weekday", "weekend", "holiday"].includes(dayType)) {
      return errorResponseHandler(
        "dayType must be weekday, weekend, or holiday",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate slotPricing
    if (!Array.isArray(slotPricing) || slotPricing.length === 0) {
      return errorResponseHandler(
        "slotPricing must be a non-empty array",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate each slot has a valid price
    for (const item of slotPricing) {
      if (!item.slot || typeof item.price !== "number" || item.price < 0) {
        return errorResponseHandler(
          "Each slot must have a valid slot name and non-negative price",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }

    // Check for duplicate slots
    const slots = slotPricing.map((item) => item.slot);
    const uniqueSlots = new Set(slots);
    if (slots.length !== uniqueSlots.size) {
      return errorResponseHandler(
        "Duplicate slots are not allowed",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    let result;

    if (id) {
      // Update existing pricing
      result = await priceModel.findByIdAndUpdate(
        id,
        { name, description, dayType, slotPricing },
        { new: true, runValidators: true }
      );

      if (!result) {
        return errorResponseHandler(
          "Pricing not found",
          httpStatusCode.NOT_FOUND,
          res
        );
      }
    } else {
      // Check if pricing with same name and dayType already exists
      const existingPricing = await priceModel.findOne({ name, dayType });
      if (existingPricing) {
        return errorResponseHandler(
          `Pricing with name '${name}' and dayType '${dayType}' already exists`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      // Create new pricing
      result = await priceModel.create({
        name,
        description,
        dayType,
        slotPricing,
      });
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: id
        ? "Pricing updated successfully"
        : "Pricing created successfully",
      data: result,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Get all pricing plans
export const getAllPricing = async (req: Request, res: Response) => {
  try {
    const { search, dayType } = req.query;

    const query: any = {};

    // Apply search filter if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Apply dayType filter if provided
    if (
      dayType &&
      ["weekday", "weekend", "holiday"].includes(dayType as string)
    ) {
      query.dayType = dayType;
    }

    const pricingPlans = await priceModel.find(query).sort({ name: 1 });

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Pricing plans retrieved successfully",
      data: pricingPlans,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Get pricing by ID
export const getPricingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return errorResponseHandler(
        "Valid pricing ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const pricing = await priceModel.findById(id);

    if (!pricing) {
      return errorResponseHandler(
        "Pricing not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Pricing retrieved successfully",
      data: pricing,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Delete pricing
export const deletePricing = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return errorResponseHandler(
        "Valid pricing ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const pricing = await priceModel.findByIdAndDelete(id);

    if (!pricing) {
      return errorResponseHandler(
        "Pricing not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Pricing deleted successfully",
      data: null,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const createUpdateAdminSettings = async (
  req: Request,
  res: Response
) => {
  try {
    const { ...updateFields } = req.body;

    const checkExist = await adminSettingModel.findOne({ isActive: true });
    let result;

    if (checkExist) {
      // Update existing settings
      result = await adminSettingModel.findByIdAndUpdate(
        checkExist._id,
        updateFields,
        { new: true, runValidators: true }
      );

      if (!result) {
        return errorResponseHandler(
          "Admin settings not found",
          httpStatusCode.NOT_FOUND,
          res
        );
      }
    } else {
      // Create new settings
      result = await adminSettingModel.create(updateFields);
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: checkExist
        ? "Admin settings updated successfully"
        : "Admin settings created successfully",
      data: result,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getAdminSettings = async (req: Request, res: Response) => {
  try {
    const settings = await adminSettingModel.findOne();

    if (!settings) {
      return errorResponseHandler(
        "Admin settings not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Admin settings retrieved successfully",
      data: settings,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const rewardsSettings = async (req: Request, res: Response) => {
  try {
    let settings: any = await adminSettingModel.findOne();
    const type = req.params.type;
    if (type && type !== "referral" && type !== "loyaltyPoints") {
      return errorResponseHandler(
        "Invalid type parameter. Must be 'referral' or 'loyaltyPoints'",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!settings) {
      settings = await adminSettingModel.create();
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Rewards settings retrieved successfully",
      data: type ? settings[type] : settings,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateRewardsSettings = async (req: Request, res: Response) => {
  try {
    let settings: any = await adminSettingModel.findOne();
    const type = req.params.type;
    if (type && type !== "referral" && type !== "loyaltyPoints") {
      return errorResponseHandler(
        "Invalid type parameter. Must be 'referral' or 'loyaltyPoints'",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!settings) {
      return errorResponseHandler(
        "Rewards settings not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    settings = await adminSettingModel.findOneAndUpdate(
      { _id: settings._id },
      { [type]: req.body },
      { new: true, runValidators: true }
    );

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Rewards settings retrieved successfully",
      data: type ? settings[type] : settings,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const createPackage = async (req: Request, res: Response) => {
  try {
    const { amount, coinReceivable } = req.body;

    const extraCoins = Math.abs(Number(amount) - Number(coinReceivable));

    const data = await playcoinModel.create({
      amount,
      coinReceivable,
      extraCoins,
    });

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Success",
      data,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getPackage = async (req: Request, res: Response) => {
  try {
    const data = await playcoinModel.find({ isActive: true });
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Rewards settings retrieved successfully",
      data: data,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updatePackage = async (req: Request, res: Response) => {
  try {
    const { _id, amount, coinReceivable } = req.body;

    const data = await playcoinModel.findById(_id);

    if (!data) {
      return errorResponseHandler(
        "Invalid package id",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const extraCoins = Math.abs(Number(amount) - Number(coinReceivable));

    const updatedData = await playcoinModel.findByIdAndUpdate(
      _id,
      {
        $set: {
          amount,
          coinReceivable,
          extraCoins,
        },
      },
      { new: true }
    );

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Package updated successfully",
      data: updatedData,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const deletePackage = async (req: Request, res: Response) => {
  try {
    const { _id } = req.query;
    const data = await playcoinModel.findById(_id);

    if (!data) {
      return errorResponseHandler(
        "No package found",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    await playcoinModel.findByIdAndDelete(_id);
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Package deleted successfully",
      data: {},
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const venueId = req.query.venueId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const matchFilter: any = {
      type: { $nin: ["PLAYER_JOINED_GAME"] },
      priority: "HIGH",
      isDeleted: false,
    };

    // Count total matching documents
    let totalNotifications = 0;

    // Build aggregation
    const aggregationPipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "users",
          localField: "recipientId",
          foreignField: "_id",
          as: "userData",
          pipeline: [
            {
              $project: {
                fullName: 1,
                email: 1,
                profilePic: 1,
                _id: 0, // Exclude _id if not needed
              },
            },
          ],
        },
      },
      { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
    ];

    if (venueId) {
      aggregationPipeline.push(
        {
          $lookup: {
            from: "bookings",
            localField: "referenceId", // from notifications
            foreignField: "_id", // from bookings
            as: "bookingData",
          },
        },
        {
          $unwind: "$bookingData",
        },
        {
          $match: {
            "bookingData.venueId": new mongoose.Types.ObjectId(venueId),
          },
        }
      );
    }

    // Clone pipeline for count before pagination stages
    const countPipeline = [...aggregationPipeline, { $count: "total" }];
    const countResult = await notificationModel.aggregate(countPipeline);
    totalNotifications = countResult[0]?.total || 0;

    // Add pagination
    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    );

    const notifications = await notificationModel.aggregate(
      aggregationPipeline
    );

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: notifications,
      meta: {
        total: totalNotifications,
        hasPreviousPage: page > 1,
        hasNextPage: skip + limit < totalNotifications,
        page,
        limit,
        totalPages: Math.ceil(totalNotifications / limit),
      },
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const readNotification = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.body;

    let updateResult;

    if (!notificationId) {
      // Mark all not-ready notifications as ready
      updateResult = await notificationModel.updateMany(
        { isReadyByAdmin: false, isDeleted: false },
        { $set: { isReadyByAdmin: true } }
      );
    } else {
      if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        return errorResponseHandler(
          "Invalid notificationId",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      updateResult = await notificationModel.updateOne(
        { _id: new mongoose.Types.ObjectId(notificationId), isDeleted: false },
        { $set: { isReadyByAdmin: true } }
      );
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message:
        updateResult.modifiedCount > 1
          ? "All unread notifications marked as ready by admin"
          : "Notification marked as ready by admin",
      updatedCount: updateResult.modifiedCount,
    });
  } catch (error: any) {
    const { code, message } = error;
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const sendPushToUsers = async (req: Request, res: Response) => {
  try {
    const { title, text, specificUsers } = req.body;

    if (specificUsers?.length && specificUsers?.length > 0) {
      await Promise.all([
        specificUsers.map((items: any) => {
          notifyUser({
            recipientId: items,
            title: title,
            message: text,
            type: "CUSTOM",
            category: "CUSTOM",
          });
        }),
      ]);
    } else {
      const users = await usersModel
        .find({ isBlocked: false })
        .select("firstName");

      await Promise.all([
        users.map((items: any) => {
          notifyUser({
            recipientId: items._id,
            title: title,
            message: text,
            type: "CUSTOM",
            category: "CUSTOM",
          });
        }),
      ]);
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Users notified successfully",
    });
  } catch (error: any) {
    const { code, message } = error;
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getUsersForPush = async (req: Request, res: Response) => {
  try {
    const users = await usersModel
      .find({ isBlocked: false })
      .select("fullName profilePic");
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Users notified successfully",
      data: users,
    });
  } catch (error: any) {
    const { code, message } = error;
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { currentUser } = req as any;
    let data = [] as any;
    const templates = [
      {
        Title: `${currentUser.venueName} Closed Due to Bad Weather`,
        Description: `We regret to inform you that games at ${currentUser.venueName} are suspended until further notice due to bad weather. Please stay tuned for updates on resumption.`,
      },
      {
        Title: "Venue Resumed – Open for Bookings",
        Description: `Good news! ${currentUser.venueName} has resumed operations and is now open for games and bookings. Thank you for your patience.`,
      },
      {
        Title: `${currentUser.venueName} Court Under Maintenance`,
        Description: `[Court Name] is temporarily closed for essential maintenance until further updates. We appreciate your patience and understanding.`,
      },
      {
        Title: `${currentUser.venueName} Maintenance Completed`,
        Description: `We are happy to announce that maintenance work at [Court Name] court has been completed. The venue is now open for play.`,
      },
    ];

    if (currentUser.role === "employee") {
      data = templates;
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Success",
      data,
    });
  } catch (error: any) {
    const { code, message } = error;
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
