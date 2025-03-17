import { Request, Response } from "express";
import { createPublisherService, getPublisherService, updatePublisherService, deletePublisherService, getAllPublishersService, getBooksByPublisherService, getBookByIdPublisherService, publisherDashboardService, getPublisherWorkService, getPublisherForUserService } from "../../services/publisher/publishers-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";

export const createPublisher = async (req: Request, res: Response) => {
    try {
        const response = await createPublisherService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getPublisher = async (req: Request, res: Response) => {
    try {
        const response = await getPublisherService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getPublisherForUser = async (req: Request, res: Response) => {
    try {
        const response = await getPublisherForUserService(req.params.id,req.user, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getPublisherWorkForUser = async (req: Request, res: Response) => {
    try {
        const response = await getPublisherWorkService(req.params.id, req.user, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updatePublisher = async (req: Request, res: Response) => {
    try {
        const response = await updatePublisherService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deletePublisher = async (req: Request, res: Response) => {
    try {
        const response = await deletePublisherService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete publisher" });
    }
};

export const getAllPublishers = async (req: Request, res: Response) => {
    try {
        const response = await getAllPublishersService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getAllBooksByPublisherId = async (req: Request, res: Response) => {
    try {
        const response = await getBooksByPublisherService(req.query,req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getBookByIdPublisher = async (req: Request, res: Response) => {
    try {
        const response = await getBookByIdPublisherService(req.params.id,req.query,req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const publisherDashboard = async (req: any, res: Response) => {
    try {
        //to be improved
        const response = await publisherDashboardService(req.query,req.currentUser, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};