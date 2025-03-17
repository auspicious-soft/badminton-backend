import { Request, Response } from "express";
import { createBookSchoolService, getBookSchoolService, updateBookSchoolService, deleteBookSchoolService, getAllBookSchoolsService, getBookSchoolsByCodeService } from "../../services/book-schools/book-schools-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { verifyBookSchoolsByCodeService } from './../../services/book-schools/book-schools-service';


export const createBookSchool = async (req: Request, res: Response) => {
    try {
        const response = await createBookSchoolService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getBookSchool = async (req: Request, res: Response) => {
    try {
        const response = await getBookSchoolService(req.query,req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateBookSchool = async (req: Request, res: Response) => {
    try {
        const response = await updateBookSchoolService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteBookSchool = async (req: Request, res: Response) => {
    try {
        const response = await deleteBookSchoolService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete book school" });
    }
};

export const getAllBookSchools = async (req: Request, res: Response) => {
    try {
        const response = await getAllBookSchoolsService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const getBookSchoolsByCode = async (req: Request, res: Response) => {
    try {
        const response = await getBookSchoolsByCodeService(req.query,req.user, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const verifyBookSchoolsByCode = async (req: Request, res: Response) => {
    try {
        const response = await verifyBookSchoolsByCodeService(req.query,req.user, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
