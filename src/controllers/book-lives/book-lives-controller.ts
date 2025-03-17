import { Request, Response } from "express"
import { createBookLiveService, getBookLiveService, updateBookLiveService, deleteBookLiveService, getAllBookLivesService, getAllBookLivesWithBlogsService } from "../../services/book-lives/book-lives-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";



export const createBookLive = async (req: Request, res: Response) => {
    try {
        const response = await createBookLiveService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getBookLive = async (req: Request, res: Response) => {
    try {
        const response = await getBookLiveService(req.params.id, req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateBookLive = async (req: Request, res: Response) => {
    try {
        const response = await updateBookLiveService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteBookLive = async (req: Request, res: Response) => {
    try {
        const response = await deleteBookLiveService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete book live" });
    }
};

export const getAllBookLives = async (req: Request, res: Response) => {
    try {
        const response = await getAllBookLivesService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getAllBookLivesWithBlogs = async (req: Request, res: Response) => {
    try {
        const response = await getAllBookLivesWithBlogsService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
