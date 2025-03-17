import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import {  getAllReadProgress, getReadProgressById, updateReadProgress } from 'src/services/read-progess/read-progress-service';

// export const createReadProgressHandler = async (req: Request, res: Response) => {
//   try {
//     const response = await createReadProgress(req.body);
//     return res.status(httpStatusCode.CREATED).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };

export const getReadProgressByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId: JwtPayload = req?.user as JwtPayload;
        const response = await getReadProgressById(req.params.id,userId.id);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateReadProgressHandler = async (req: Request, res: Response) => {
  try {
    const response = await updateReadProgress(req.params.id, req.body,req.user,res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// export const deleteReadProgressHandler = async (req: Request, res: Response) => {
//   try {
//     const response = await deleteReadProgress(req.params.id, res);
//     return res.status(httpStatusCode.OK).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };

export const getAllReadProgressHandler = async (req: Request, res: Response) => {
  try {
    const response = await getAllReadProgress(req.query,req.user);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};