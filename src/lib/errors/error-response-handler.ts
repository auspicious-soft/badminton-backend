import multer from "multer";
import { Response } from "express";
import { httpStatusCode } from "../constant";

/**
 * Standardized error response handler
 * @param message Error message
 * @param code HTTP status code
 * @param res Express Response object
 * @returns Never returns - throws an error with JSON payload
 */
export const errorResponseHandler = (message: string, code: number = 500, res: Response) => {
    throw new Error(JSON.stringify({
        success: false,
        message,
        code
    }));
};

/**
 * Parse error message from thrown errors
 * @param error Any error object
 * @returns Parsed error with code and message
 */
export const errorParser = (error: any) => {
    try {
        return JSON.parse(error.message);
    } catch (e) {
        // If error is not in our JSON format, return a generic error
        return {
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
            message: error?.message || "An unexpected error occurred"
        };
    }
};

/**
 * Consistent error response formatter
 * @param res Express Response object
 * @param error Any error object
 * @returns Formatted error response
 */
export const formatErrorResponse = (res: Response, error: any) => {
    const { code, message } = errorParser(error);
    return res
        .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
        .json({ 
            success: false, 
            message: message || "An error occurred",
            timestamp: new Date().toISOString()
        });
};

/**
 * Multer error handler middleware
 */
export const checkMulter = (err: any, req: any, res: any, next: any) => {
    if (err instanceof multer.MulterError) {
        res.status(httpStatusCode.BAD_REQUEST).json({ 
            success: false, 
            message: `${err.message}`,
            timestamp: new Date().toISOString()
        });
    } else {
        next();
    }
}
