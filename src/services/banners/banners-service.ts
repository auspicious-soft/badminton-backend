import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { nestedQueryBuilder, queryBuilder } from "src/utils";
import { deleteFileFromS3 } from "src/config/s3";
import { bannersModel } from "../../models/banners/banners-schema";

export const createBannerService = async (payload: any, res: Response) => {
  const newBanner = new bannersModel(payload);
  const savedBanner = await newBanner.save();
  return {
    success: true,
    message: "Banner created successfully",
    data: savedBanner,
  };
};

export const getBannerService = async (id: string, res: Response) => {
  const banner = await bannersModel.findById(id);
  if (!banner) return errorResponseHandler("Banner not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Banner retrieved successfully",
    data: banner,
  };
};

export const getAllBannersService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await bannersModel.countDocuments() : await bannersModel.countDocuments(query);
  const results = await bannersModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Banners retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      message: "No banners found",
      success: false,
      total: 0,
    };
  }
};

export const updateBannerService = async (id: string, payload: any, res: Response) => {
  const updatedBanner = await bannersModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedBanner) return errorResponseHandler("Banner not found", httpStatusCode.NOT_FOUND, res);
  
  return {    
    success: true,
    message: "Banner updated successfully",
    data: updatedBanner,
  };
};

export const deleteBannerService = async (id: string, res: Response) => {
  const deletedBanner = await bannersModel.findByIdAndDelete(id);
  if (!deletedBanner) return errorResponseHandler("Banner not found", httpStatusCode.NOT_FOUND, res);
  if (deletedBanner?.image) {
      await deleteFileFromS3(deletedBanner.image);
  }
  return {
    success: true,
    message: "Banner deleted successfully",
    data: deletedBanner,
  };
};
