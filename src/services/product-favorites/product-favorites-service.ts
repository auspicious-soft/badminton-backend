import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { favoritesModel } from "../../models/product-favorites/product-favorites-schema";
import { queryBuilder } from "src/utils";

export const createFavoriteService = async (payload: any, user: any, res: Response) => {
  try {
    const newFavorite = new favoritesModel({ ...payload, userId: user.id });
    const savedFavorite = await newFavorite.save();
    return {
      success: true,
      message: "Favorite created successfully",
      data: savedFavorite,
    };
  } catch (error) {
    return errorResponseHandler("Error creating favorite", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const getFavoriteService = async (id: string, user: any, res: Response) => {
  try {
    const favorite = await favoritesModel.findById(id).populate({
      path: "productId",
      populate: [{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }],
    });
    if (!favorite) return errorResponseHandler("Favorite not found", httpStatusCode.NOT_FOUND, res);
    return {
      success: true,
      message: "Favorite retrieved successfully",
      data: favorite,
    };
  } catch (error) {
    return errorResponseHandler("Error retrieving favorite", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const getAllFavoritesService = async (payload: any, user: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["name"]);

  (query as any).userId = user.id;

  const totalDataCount = Object.keys(query).length < 1 ? await favoritesModel.countDocuments() : await favoritesModel.countDocuments(query);

  const results = await favoritesModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v")
    .populate({
      path: "productId",
      populate: [
        { path: "authorId", select: "name" },
        { path: "categoryId", select: "name" },
        { path: "subCategoryId", select: "name" },
        { path: "publisherId", select: "name" },
      ],
    })
    .lean();

  const modifiedResults = results.map((item) => {
    if (item.productId) {
      return {
        ...item,
        productId: {
          ...item.productId,
          favorite: true,
        },
      };
    }
    return item;
  });

  if (modifiedResults.length)
    return {
      page,
      limit,
      success: true,
      message: "Favorites retrieved successfully",
      total: totalDataCount,
      data: modifiedResults,
    };
  else {
    return {
      data: [],
      page,
      limit,
      success: false,
      message: "No favorites found",
      total: 0,
    };
  }
};

export const updateFavoriteService = async (user: any, payload: any, res: Response) => {
    const isFavorite = typeof payload.favorite === "string" ? JSON.parse(payload.favorite) : payload.favorite;

    if (isFavorite) {
      const updatedFavorite = await favoritesModel.findOneAndUpdate(
        { productId: payload.productId, userId: user.id }, // Find existing favorite
        { $set: { productId: payload.productId, userId: user.id } }, // Update fields
        { new: true, upsert: true } // Create if not found
      );
      // if (!updatedFavorite) return errorResponseHandler("Favorite not found", httpStatusCode.NOT_FOUND, res);
      return {
        success: true,
        message: "Favorite updated successfully",
        data: updatedFavorite,
      };
    } else {
      const Favorite = await favoritesModel.find({ productId: payload.productId, userId: user.id });
      if (!Favorite || Favorite.length === 0) {
        return errorResponseHandler("Favorite not found", httpStatusCode.NOT_FOUND, res);
      }
      const deletedFavorite = await favoritesModel.findOneAndDelete({ productId: payload.productId, userId: user.id });

      return {
        success: true,
        message: "Favorite deleted successfully",
        data: deletedFavorite,
      };
    }
  
};

export const deleteFavoriteService = async (user: any, id: string, res: Response) => {
    const deletedFavorite = await favoritesModel.findOneAndDelete({ productId: id, userId: user.id });
    if (!deletedFavorite) {
      return errorResponseHandler("Favorite not found", httpStatusCode.NOT_FOUND, res);
    }
    return {
      success: true,
      message: "Favorite deleted successfully",
      data: deletedFavorite ? deletedFavorite : {},
    };
  
};
