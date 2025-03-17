import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import { createBlogService, deleteBlogService, getAllBlogsService, getBlogService, updateBlogService } from 'src/services/blogs/blogs-service';

export const createBlog = async (req: Request, res: Response) => {
    try {
        const response = await createBlogService(req.body,res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getBlogById = async (req: Request, res: Response) => {
    try {
        const response = await getBlogService(req.params.id,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const updateBlog = async (req: Request, res: Response) => {
    try {
        const response = await updateBlogService(req.params.id, req.body,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const deleteBlog = async (req: Request, res: Response) => {
    try {
        const response = await deleteBlogService(req.params.id,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};

export const getAllBlogs = async (req: Request, res: Response) => {
    try {
        const response = await getAllBlogsService(req.query,res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
};
