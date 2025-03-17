import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import { getHomePageService, getproductsTabService } from 'src/services/userHomepage/user-home-page-service';

export const getHomePageHandler = async (req: Request, res: Response) => {
    try {
      const response = await getHomePageService(req.query,res)
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const getproductsTabHandler = async (req: Request, res: Response) => {
    try {
      const response = await getproductsTabService(req.query,res)
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

