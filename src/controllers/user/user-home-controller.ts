import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import { errorParser } from "../../lib/errors/error-response-handler";
import {acceptFriendRequestServices, getCourtsServices, getOpenMatchesServices, getVenuesServices, searchFriendServices, sendRequestServices, userHomeServices } from "src/services/user/home-services";
import { bookCourtServices, joinOpenBookingServices, userNotificationServices } from "src/services/user/booking-services";
import { getUserServices } from "src/services/user/user-service";


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

export const getUser = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await getUserServices(req, res);
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
export const joinOpenCourt = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await joinOpenBookingServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getOpenMatches = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await getOpenMatchesServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const userNotifications = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await userNotificationServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const searchFriend = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await searchFriendServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};  

export const sendRequest = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await sendRequestServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const acceptFriendRequest = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const response = await acceptFriendRequestServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};