import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import mongoose from "mongoose";
import { priceModel } from "src/models/admin/price-schema";
import { adminSettingModel } from "src/models/admin/admin-settings";

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
