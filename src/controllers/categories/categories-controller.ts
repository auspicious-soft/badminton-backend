import { Request, Response } from "express"
import { createCategoryService, getCategoryService, updateCategoryService, deleteCategoryService, getAllCategoriesService, addBookToCategoryService, getBooksByCategoryIdService } from "../../services/category/category-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";

export const createCategory = async (req: Request, res: Response) => {
    try {
        const response = await createCategoryService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getCategory = async (req: Request, res: Response) => {
    try {
        const response = await getCategoryService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getBooksByCategoryId = async (req: Request, res: Response) => {
    try {
        const response = await getBooksByCategoryIdService(req.params.id, req.user,req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
        const response = await updateCategoryService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const response = await deleteCategoryService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete sub-category" });
    }
};


export const getAllCategories = async (req: Request, res: Response) => {
    try {
        const response = await getAllCategoriesService(req.query,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const addBooksToCategory = async (req: Request, res: Response) => {
  try {
    const response = await addBookToCategoryService(req.body,req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};