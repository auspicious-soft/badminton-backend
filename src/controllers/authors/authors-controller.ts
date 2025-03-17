import { Request, Response } from "express";
import { createPublisherService, getPublisherService, updatePublisherService, deletePublisherService, getAllPublishersService } from "../../services/publisher/publishers-service";
import { createAuthorService, getAuthorService, updateAuthorService, deleteAuthorService, getAllAuthorsService, getAllAuthorsForUserService, getAuthorForUserService, getAuthorCountriesService } from "../../services/authors/authors-service";
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

export const createAuthor = async (req: Request, res: Response) => {
    try {
        const response = await createAuthorService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getAuthor = async (req: Request, res: Response) => {
    try {
        const response = await getAuthorService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getAuthorForUser = async (req: Request, res: Response) => {
    try {
        const response = await getAuthorForUserService(req.user, req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateAuthor = async (req: Request, res: Response) => {
    try {
        const response = await updateAuthorService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteAuthor = async (req: Request, res: Response) => {
    try {
        const response = await deleteAuthorService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete author" });
    }
};

export const getAllAuthors = async (req: Request, res: Response) => {
    try {
        const response = await getAllAuthorsService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getAllAuthorsForUser = async (req: Request, res: Response) => {
    try {
        const response = await getAllAuthorsForUserService(req.user,req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getAuthorCountries = async (req: Request, res: Response) => {
    try {
        const response = await getAuthorCountriesService( res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
