import { Request, Response } from "express";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import {
  createSubCategoryService,
  getSubCategoriesService,
  updateSubCategoryService,
  deleteSubCategoryService,
  getAllSubCategoriesService,
  getSubCategoriesByCategoryIdService,
  addBookToSubCategoryService,
  getSubCategoriesByCategoryIdForUserService,
  getSubCategoriesForUserService,
} from "../../services/sub-category/sub-category-service";

export const createSubCategory = async (req: Request, res: Response) => {
  try {
    const response = await createSubCategoryService(req.body, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getAllSubCategory = async (req: Request, res: Response) => {
  try {
    const response = await getAllSubCategoriesService(req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getSubCategory = async (req: Request, res: Response) => {
  try {
    const response = await getSubCategoriesService(req.query,req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getSubCategoryforUser = async (req: Request, res: Response) => {
  try {
    const response = await getSubCategoriesForUserService(req.user, req.query,req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const addBooksToSubCategory = async (req: Request, res: Response) => {
  try {
    const response = await addBookToSubCategoryService(req.body,req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getSubCategoriesByCategoryId = async (
  req: Request,
  res: Response
) => {
  try {
    const { categoryId } = req.params;
    const response = await getSubCategoriesByCategoryIdService(req.query,categoryId, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getSubCategoriesByCategoryIdForUser = async (
  req: Request,
  res: Response
) => {
  try {
    const { categoryId } = req.params;
    const response = await getSubCategoriesByCategoryIdForUserService(req.query,categoryId, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const updateSubCategory = async (req: Request, res: Response) => {
  try {
    const response = await updateSubCategoryService(
      req.params.id,
      req.body,
      res
    );
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteSubCategory = async (req: Request, res: Response) => {
  try {
    const response = await deleteSubCategoryService(req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
