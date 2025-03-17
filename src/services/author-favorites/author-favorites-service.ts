import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { queryBuilder } from "src/utils";
import { authorFavoritesModel } from "src/models/author-favorites/author-favorites-schema";

export const createAuthorFavoriteService = async (payload: any, user: any, res: Response) => {
  try {
    const newFavorite = new authorFavoritesModel({ ...payload, userId: user.id });
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

export const getAuthorFavoriteService = async (id: string, user: any, res: Response) => {
  try {
    const favorite = await authorFavoritesModel.findById(id)

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

export const getAllAuthorFavoritesService = async (payload: any, user: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["name"]);

  (query as any).userId = user.id;

  const totalDataCount = Object.keys(query).length < 1 ? await authorFavoritesModel.countDocuments() : await authorFavoritesModel.countDocuments(query);

  const results = await authorFavoritesModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .populate("authorId")
    .select("-__v")
    .lean();

  const modifiedResults = results.map((item) => {
    if (item.authorId) {
      return {
        ...item,
        productId: {
          ...item.authorId,
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

export const updateAuthorFavoriteService = async (user: any, payload: any, res: Response) => {
    const isFavorite = typeof payload.favorite === "string" ? JSON.parse(payload.favorite) : payload.favorite;

    if (isFavorite) {
      const updatedFavorite = await authorFavoritesModel.findOneAndUpdate(
        { authorId: payload.productId, userId: user.id }, 
        { $set: { authorId: payload.authorId, userId: user.id } }, 
        { new: true, upsert: true } 
      );
      return {
        success: true,
        message: "Favorite updated successfully",
        data: updatedFavorite,
      };
    } else {
      const Favorite = await authorFavoritesModel.find({ authorId: payload.authorId, userId: user.id });
      if (!Favorite || Favorite.length === 0) {
        return errorResponseHandler("Favorite not found", httpStatusCode.NOT_FOUND, res);
      }
      const deletedFavorite = await authorFavoritesModel.findOneAndDelete({ authorId: payload.authorId, userId: user.id });

      return {
        success: true,
        message: "Favorite deleted successfully",
        data: deletedFavorite,
      };
    }
  
};

export const deleteAuthorFavoriteService = async (user: any, id: string, res: Response) => {
    const deletedFavorite = await authorFavoritesModel.findOneAndDelete({ authorId: id, userId: user.id });
    if (!deletedFavorite) {
      return errorResponseHandler("Favorite not found", httpStatusCode.NOT_FOUND, res);
    }
    return {
      success: true,
      message: "Favorite deleted successfully",
      data: deletedFavorite ? deletedFavorite : {},
    };
  
};
