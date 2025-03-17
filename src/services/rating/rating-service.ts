import { queryBuilder } from "src/utils";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { httpStatusCode } from "src/lib/constant";
import { Response } from "express";
import { productRatingsModel } from "src/models/ratings/ratings-schema";
import { productsModel } from "src/models/products/products-schema";
import mongoose from "mongoose";

export const createRatingService = async (payload: any, res: Response) => {
  const newRating = new productRatingsModel(payload);
  const savedRating = await newRating.save();
  return {
    success: true,
    message: "Rating created successfully",
    data: savedRating,
  };
};

export const getRatingService = async (id: string, res: Response) => {
  const ratings = await productRatingsModel.find({ productId: id }).populate([{ path: "userId", select: "-password -__v -otp -token" }]);
  const totalRatings = ratings.length;
  const product = await productsModel.findById(id);
  if (!ratings || ratings.length === 0) {
    return errorResponseHandler("Rating not found", httpStatusCode.NOT_FOUND, res);
  }

  const objectId = new mongoose.Types.ObjectId(id);

  const ratingCounts = await productRatingsModel.aggregate([{ $match: { productId: objectId } }, { $group: { _id: "$rating", count: { $sum: 1 } } }]);


  const ratingStats: { [key: string]: number } = { rating1: 0, rating2: 0, rating3: 0, rating4: 0, rating5: 0 };

  ratingCounts.forEach(({ _id, count }) => {
    if (_id >= 1 && _id <= 5) {
      ratingStats[`rating${_id}`] = count;
    }
  });

  return {
    success: true,
    message: "Ratings retrieved successfully",
    data: { ratings, ...ratingStats , averageRating: product? product?.averageRating : 0 ,totalRatings},
  };
};



export const getAllRatingsService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["productId"]);

  const totalDataCount = Object.keys(query).length < 1 ? await productRatingsModel.countDocuments() : await productRatingsModel.countDocuments(query);
  const results = await productRatingsModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Ratings retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      success: false,
      total: 0,
    };
  }
};

export const updateRatingService = async (id: string, payload: any, res: Response) => {
  const updatedRating = await productRatingsModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedRating) return errorResponseHandler("Rating not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Rating updated successfully",
    data: updatedRating,
  };
};

export const deleteRatingService = async (id: string, res: Response) => {
  const deletedRating = await productRatingsModel.findByIdAndDelete(id);
  if (!deletedRating) return errorResponseHandler("Rating not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Rating deleted successfully",
    data: deletedRating,
  };
};

export const addBookRatingService = async (productId: string, ratingData: any, user: any, res: Response) => {
  // Find the product
  const product = await productsModel.findById(productId);
  if (!product) {
    return errorResponseHandler("Product not found", httpStatusCode.NOT_FOUND, res);
  }

  // Add the new rating to the productRatingsModel
  const newRating = await productRatingsModel.findOneAndUpdate(
    { userId: user.id, productId: productId },
    { userId: user.id, productId: productId, rating: ratingData.rating, comment: ratingData.comment || "" },
    { upsert: true, new: true }
  );
  if (!newRating) {
    return errorResponseHandler("Rating not added", httpStatusCode.NOT_FOUND, res);
  }

  const ratings = await productRatingsModel.find({ productId: productId });
  const averageRating: number = ratings.reduce((acc: number, rating: { rating: number }) => acc + rating.rating, 0) / ratings.length;

  // Update the product's average rating
  product.averageRating = averageRating;
  await product.save();

  return {
    success: true,
    message: "Rating added successfully",
    data: newRating,
  };
};
