import { Request, Response } from "express";
import { addBooksToBookMaster, getBookMasterService, updateBookMasterService, deleteBookMasterService, getAllBookMastersService, getAvailableProductsService, getBookMastersForUserService, getBookMasterReadProgressService, getBookMasterNewbookService, getBookMasterTeacherService, getPopularCoursesBookMasterService, getBookMasterCategoryService } from "../../services/book-masters/book-masters-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";

export const createBookMaster = async (req: Request, res: Response) => {
    try {
        const response = await addBooksToBookMaster(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getBookMaster = async (req: Request, res: Response) => {
    try {
        const response = await getBookMasterService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateBookMaster = async (req: Request, res: Response) => {
    try {
        const response = await updateBookMasterService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteBookMaster = async (req: Request, res: Response) => {
    try {
        const response = await deleteBookMasterService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete book master" });
    }
};

export const getAllBookMasters = async (req: Request, res: Response) => {
    try {
        const response = await getAllBookMastersService(req.query);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getAvailableProductsMasters = async (req: Request, res: Response) => {
    try {
        const response = await getAvailableProductsService(res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getBookMasterCategories = async (req: Request, res: Response) => {
    try {
        const response = await getBookMasterCategoryService(req.query,req.user,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getBookMasterTeachers = async (req: Request, res: Response) => {
    try {
        const response = await getBookMasterTeacherService(req.query,req.user,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getPopularCoursesBookMaster = async (req: Request, res: Response) => {
    try {
        const response = await getPopularCoursesBookMasterService(req.query,req.user,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getBookMasterNewbooks = async (req: Request, res: Response) => {
    try {
        const response = await getBookMasterNewbookService(req.user,req.query,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getBookMasterReadProgress = async (req: Request, res: Response) => {
    try {
        const response = await getBookMasterReadProgressService(req.user,req.query,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getBookMasterForUser = async (req: Request, res: Response) => {
    try {
        const response = await getBookMastersForUserService(req.user,req.query,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};