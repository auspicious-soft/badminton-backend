import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { createFavoriteService, getFavoriteService, getAllFavoritesService, updateFavoriteService, deleteFavoriteService } from "src/services/product-favorites/product-favorites-service";

export const createFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await createFavoriteService(req.body, user, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await getFavoriteService(req.params.id, user, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getAllFavorites = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await getAllFavoritesService(req.query, user, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await updateFavoriteService(user, req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await deleteFavoriteService(user, req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
