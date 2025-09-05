import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "../../lib/errors/error-response-handler";
import {
  clubResponseServices,
  createGuestServices,
  getCourtsServices,
  getOpenMatchesByIdServices,
  getOpenMatchesServices,
  getVenuesServices,
  userHomeServices,
} from "src/services/user/home-services";
import {
  bookCourtServices,
  cancelBookingServices,
  // getDynamicPriceServices,
  joinOpenBookingServices,
  modifyBookingServices,
  paymentBookingServices,
  readUserNotificationServices,
  userNotificationServices,
} from "src/services/user/booking-services";
import {
  generateAndSendOTP,
  getAppInfoServices,
  getUserServices,
  updateUserServices,
  verifyOTPService,
} from "src/services/user/user-service";
import { usersModel } from "src/models/user/user-schema";
import mongoose from "mongoose";

export const userHome = async (req: Request, res: Response) => {
  try {
    const response = await userHomeServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const submitPhone = async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    const userData = req.user as any;
    const checkExist = await usersModel.findOne({
      _id: { $ne: new mongoose.Types.ObjectId(userData.id) },
      phoneNumber,
      phoneVerified: true,
    });

    if (checkExist) {
      return errorResponseHandler(
        "Number already exist",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    await usersModel.findByIdAndUpdate(userData.id, {
      phoneNumber,
      phoneVerified: false,
    });

    await generateAndSendOTP("Phone", { phoneNumber });

    const response = {
      success: true,
      message: "Otp send successfully",
      data: {},
    };

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyPhoneNumber = async (req: Request, res: Response) => {
  try {
    const { otp: phoneOtp } = req.body;
    const userData = req.user as any;
    const response = await verifyOTPService({ phoneOtp }, req, res);

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const clubStatus = async (req: Request, res: Response) => {
  try {
    const response = await clubResponseServices(req, res);
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
    const response = await getUserServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const updateUser = async (req: Request, res: Response) => {
  try {
    const response = await updateUserServices(req, res);
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
    const response = await getCourtsServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const createGuest = async (req: Request, res: Response) => {
  try {
    if (!req.body.fullName) {
      throw new Error("Fullname is required");
    }
    const response = await createGuestServices(req, res);
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
    const response = await bookCourtServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const modifyBooking = async (req: Request, res: Response) => {
  try {
    const response = await modifyBookingServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const bookingPayment = async (req: Request, res: Response) => {
  try {
    const response = await paymentBookingServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// export const getDynamicPrice = async (req: Request, res: Response) => {
//   try {
//     const response = await getDynamicPriceServices(req, res);
//     return res.status(httpStatusCode.OK).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res
//       .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
//       .json({ success: false, message: message || "An error occurred" });
//   }
// };

export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const response = await cancelBookingServices(req, res);
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
    const response = await getOpenMatchesServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getOpenMatchesById = async (req: Request, res: Response) => {
  try {
    const response = await getOpenMatchesByIdServices(req, res);
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
    const response = await userNotificationServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const readUserNotifications = async (req: Request, res: Response) => {
  try {
    const response = await readUserNotificationServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getAppInfo = async (req: Request, res: Response) => {
  try {
    const response = await getAppInfoServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
