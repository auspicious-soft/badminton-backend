import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import {  getAwardService, updateAwardService, getAllAwardsService } from 'src/services/awards/awards-service';



export const getAward = async (req: Request, res: Response) => {
  try {
    const response = await getAwardService(req.user, res);
    return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
    const { code, message } = errorParser(error)
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateAward = async (req: Request, res: Response) => {
  try {
    const response = await updateAwardService(req.params.id, req.body, res);
    return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
    const { code, message } = errorParser(error)
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
