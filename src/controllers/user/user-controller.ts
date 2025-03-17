import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import { errorParser } from "../../lib/errors/error-response-handler";
import {
  createUserService,
  deleteUserService,
  generateAndSendOTP,
  getAllUserService,
  getUserProfileDetailService,
  getUserService,
  updateUserService,
  verifyOTPService,
  forgotPasswordUserService,
  signUpService,
  loginUserService,
  changePasswordService,
  getCurrentUserDetailsService,
  updateCurrentUserDetailsService,
  WhatsappLoginService,
} from "src/services/user/user-service";
import { newPassswordAfterOTPVerifiedService } from "src/services/admin/admin-service";
import { verifyOtpPasswordResetService, newPassswordAfterOTPVerifiedUserService } from "../../services/user/user-service";

export const userSignup = async (req: Request, res: Response) => {
  try {
    const user = await signUpService(req.body, req.body.authType, res);

    return res.status(httpStatusCode.OK).json(user);
  }  catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const loginResponse = await loginUserService(req.body, req.body.authType, res);
    return res.status(httpStatusCode.OK).json(loginResponse);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const socialLoginUser = async (req: Request, res: Response) => {
  try {
    const loginResponse = await loginUserService(req.body, req.body.authType, res);
    return res.status(httpStatusCode.OK).json(loginResponse);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const WhatsapploginUser = async (req: Request, res: Response) => {
  try {
    const whatsappLoginResponse = await WhatsappLoginService(req.body, req.body.authType, res);
    return res.status(httpStatusCode.OK).json(whatsappLoginResponse);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const forgotPasswordUser = async (req: Request, res: Response) => {
  try {
    const response = await forgotPasswordUserService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyOtpPasswordReset = async (req: Request, res: Response) => {
  const { otp } = req.body;
  try {
    const response = await verifyOtpPasswordResetService(otp, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const newPassswordAfterOTPVerifiedUser = async (req: Request, res: Response) => {
  try {
    const response = await newPassswordAfterOTPVerifiedUserService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const newPassswordAfterOTPVerifiedApp = async (req: Request, res: Response) => {
  try {
    const response = await newPassswordAfterOTPVerifiedService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Dashboard
export const getUserDashboardStats = async (req: Request, res: Response) => {
  try {
    const response = await getUserProfileDetailService(req.params.id, req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const createNewUser = async (req: Request, res: Response) => {
  try {
    const response = await createUserService(req.body, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const response = await getUserService(req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const getAllUser = async (req: Request, res: Response) => {
  try {
    const response = await getAllUserService(req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const response = await updateUserService(req.params.id, req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const response = await deleteUserService(req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const changePasswordUser = async (req: Request, res: Response) => {
  try {
    const response = await changePasswordService(req.user,req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { user } = await verifyOTPService(req.body);

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};
export const resendOTP = async (req: Request, res: Response) => {
  try {
    const response = await generateAndSendOTP(req.body);

    res.status(200).json({
      success: true,
      data: { response },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

export const getCurrentUserDetails = async (req: Request, res: Response) => {
  try {
    const response = await getCurrentUserDetailsService(req.user, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const updateCurrentUserDetails = async (req: Request, res: Response) => {
  try {
    const response = await updateCurrentUserDetailsService(req.user,req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};