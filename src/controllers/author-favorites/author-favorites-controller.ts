import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { createAuthorFavoriteService, deleteAuthorFavoriteService, getAllAuthorFavoritesService, getAuthorFavoriteService, updateAuthorFavoriteService } from "src/services/author-favorites/author-favorites-service";

export const createAuthorFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await createAuthorFavoriteService(req.body, user, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getAuthorFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await getAuthorFavoriteService(req.params.id, user, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getAllAuthorFavorites = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await getAllAuthorFavoritesService(req.query, user, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateAuthorFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await updateAuthorFavoriteService(user, req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteAuthorFavorite = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const response = await deleteAuthorFavoriteService(user, req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
