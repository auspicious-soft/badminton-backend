import { Request, Response } from "express";
import { createSummaryService, getSummaryService, updateSummaryService, deleteSummaryService, getAllSummariesService, addBooksToSummaryService } from "../../services/summaries/summaries-service";
import { createDiscountVoucherService, getDiscountVoucherService, updateDiscountVoucherService, deleteDiscountVoucherService, getAllDiscountVouchersService, verifyDiscountVoucherService } from "../../services/discount-vouchers/discount-vouchers-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";

export const createSummary = async (req: Request, res: Response) => {
    try {
        const response = await createSummaryService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getSummary = async (req: Request, res: Response) => {
    try {
        const response = await getSummaryService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateSummary = async (req: Request, res: Response) => {
    try {
        const response = await updateSummaryService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteSummary = async (req: Request, res: Response) => {
    try {
        const response = await deleteSummaryService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete summary" });
    }
};

export const getAllSummaries = async (req: Request, res: Response) => {
    try {
        const response = await getAllSummariesService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const addBooksToSummary = async (req: Request, res: Response) => {
    try {
        const response = await addBooksToSummaryService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const createDiscountVoucher = async (req: Request, res: Response) => {
    try {
        const response = await createDiscountVoucherService(req.body, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getDiscountVoucher = async (req: Request, res: Response) => {
    try {
        const response = await getDiscountVoucherService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
export const verifyDiscountVoucher = async (req: Request, res: Response) => {
    try {
        const response = await verifyDiscountVoucherService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateDiscountVoucher = async (req: Request, res: Response) => {
    try {
        const response = await updateDiscountVoucherService(req.params.id, req.body, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteDiscountVoucher = async (req: Request, res: Response) => {
    try {
        const response = await deleteDiscountVoucherService(req.params.id, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "Failed to delete discount voucher" });
    }
};

export const getAllDiscountVouchers = async (req: Request, res: Response) => {
    try {
        const response = await getAllDiscountVouchersService(req.query, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
