import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import { errorParser } from "../../lib/errors/error-response-handler";
import { bookCourtServices, getCourtsServices, getVenuesServices, userHomeServices } from "src/services/user/home-services";


export const userHome = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await userHomeServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getVenues = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await getVenuesServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getCourts = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await getCourtsServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const bookCourt = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await bookCourtServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};