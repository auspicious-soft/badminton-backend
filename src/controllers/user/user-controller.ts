import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import { errorParser, errorResponseHandler, formatErrorResponse } from "../../lib/errors/error-response-handler";
import {
  createUserService,
  deleteUserService,
  generateAndSendOTP,
  updateUserService,
  verifyOTPService,
  forgotPasswordUserService,
  signUpService,
  loginUserService,
  changePasswordService,
  updateCurrentUserDetailsService,
  verifyOtpPasswordForgetService,
  socialLoginService,
  uploadStreamToS3Service,
} from "src/services/user/user-service";
import { newPassswordAfterOTPVerifiedService } from "src/services/admin/admin-service";
import {
  verifyOtpPasswordResetService,
  newPassswordAfterOTPVerifiedUserService,
} from "../../services/user/user-service";
import { getCurrentISTTime } from "../../utils";
import { Readable } from "stream";
import Busboy from 'busboy';


export const userSignup = async (req: Request, res: Response) => {
  try {
    const authType =
      req.body.email && req.body.phoneNumber ? "Email-Phone" : null;
    if (authType == null) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({
          success: false,
          message: "Both Email and Phone number is required",
          timestamp: new Date().toISOString()
        });
    }
    const user = await signUpService(req.body, authType, res);
    return res.status(httpStatusCode.OK).json(user);
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const loginResponse = await loginUserService(
      req.body,
      req.body.authType,
      res
    );
    return res.status(httpStatusCode.OK).json(loginResponse);
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};
export const socialLogin = async (req: Request, res: Response) => {
  try {
    !["Google", "Apple", "Facebook"].includes(req.body.authType)
      ? res
          .status(httpStatusCode.BAD_REQUEST)
          .json({ success: false, message: "Invalid Auth Type" })
      : null;
      
    const loginResponse = await socialLoginService(
      req.body,
      req.body.authType,
      res
    );
    return res.status(httpStatusCode.OK).json(loginResponse);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const socialLoginUser = async (req: Request, res: Response) => {
  try {
    const loginResponse = await loginUserService(
      req.body,
      req.body.authType,
      res
    );
    return res.status(httpStatusCode.OK).json(loginResponse);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const forgotPasswordUser = async (req: Request, res: Response) => {
  try {
    const response = await forgotPasswordUserService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

export const verifyOtpPasswordReset = async (req: Request, res: Response) => {
  const { otp } = req.body;
  try {
    const response = await verifyOtpPasswordResetService(otp, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyOtpPasswordForget = async (req: Request, res: Response) => {
  try {
    const { otp, phoneNumber } = req.body;
    const response = await verifyOtpPasswordForgetService(otp, phoneNumber);
    return res.status(httpStatusCode.OK).json({
      ...response,
      verifiedAt: getCurrentISTTime().toISOString() // Use IST time for verification timestamp
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

export const newPassswordAfterOTPVerifiedUser = async (
  req: Request,
  res: Response
) => {
  try {
    const response = await newPassswordAfterOTPVerifiedUserService(
      req.body,
      res,
      req
    );
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const newPassswordAfterOTPVerifiedApp = async (
  req: Request,
  res: Response
) => {
  try {
    const response = await newPassswordAfterOTPVerifiedService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Dashboard
// export const getUserDashboardStats = async (req: Request, res: Response) => {
//   try {
//     const response = await getUserProfileDetailService(req.params.id, req.query, res);
//     return res.status(httpStatusCode.OK).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };

export const createNewUser = async (req: Request, res: Response) => {
  try {
    const response = await createUserService(req.body, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// export const getUser = async (req: Request, res: Response) => {
//   try {
//     const response = await getUserService(req.params.id, res);
//     return res.status(httpStatusCode.OK).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };
// export const getAllUser = async (req: Request, res: Response) => {
//   try {
//     const response = await getAllUserService(req.query, res);
//     return res.status(httpStatusCode.OK).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };

export const updateUser = async (req: Request, res: Response) => {
  try {
    const response = await updateUserService(req.params.id, req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const response = await deleteUserService(req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const changePasswordUser = async (req: Request, res: Response) => {
  try {
    const response = await changePasswordService(req.user, req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { otp, phoneNumber } = req.body;
    const response = await verifyOTPService(otp, phoneNumber, res);
    return res.status(httpStatusCode.OK).json({
      ...response,
      verifiedAt: getCurrentISTTime().toISOString() // Use IST time for verification timestamp
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};
export const resendOTP = async (req: Request, res: Response) => {
  try {
    const response = await generateAndSendOTP("", req.body);
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

// export const getCurrentUserDetails = async (req: Request, res: Response) => {
//   try {
//     const response = await getCurrentUserDetailsService(req.user, res);
//     return res.status(httpStatusCode.OK).json(response);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };
export const updateCurrentUserDetails = async (req: Request, res: Response) => {
  try {
    const response = await updateCurrentUserDetailsService(
      req.user,
      req.body,
      res
    );
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const uploadUserImageController = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userEmail = userData.email || req.query.email as string;
    
    if (!userEmail) {
      return errorResponseHandler('User email is required', httpStatusCode.BAD_REQUEST, res);
    }
    
    // Check content type
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      return errorResponseHandler('Content-Type must be multipart/form-data', httpStatusCode.BAD_REQUEST, res);
    }
    
    const busboy = Busboy({ headers: req.headers });
    let uploadPromise: Promise<string> | null = null;
    
    busboy.on('file', async (fieldname: string, fileStream: any, fileInfo: any) => {
      if (fieldname !== 'image') {
        fileStream.resume(); // Skip this file
        return;
      }
      
      const { filename, mimeType } = fileInfo;
      
      // Create a readable stream from the file stream
      const readableStream = new Readable();
      readableStream._read = () => {}; // Required implementation
      
      fileStream.on('data', (chunk :any) => {
        readableStream.push(chunk);
      });
      
      fileStream.on('end', () => {
        readableStream.push(null); // End of stream
      });
      
      uploadPromise = uploadStreamToS3Service(
        readableStream,
        filename,
        mimeType,
        userEmail
      );
    });
    
    busboy.on('finish', async () => {
      if (!uploadPromise) {
        return res.status(httpStatusCode.BAD_REQUEST).json({
          success: false,
          message: 'No image file found in the request'
        });
      }
      
      try {
        const imageKey = await uploadPromise;
        return res.status(httpStatusCode.OK).json({
          success: true,
          message: 'Image uploaded successfully',
          data: { imageKey }
        });
      } catch (error) {
        console.error('Upload error:', error);
        return formatErrorResponse(res, error);
      }
    });
    
    req.pipe(busboy);
  } catch (error) {
    console.error('Upload error:', error);
    return formatErrorResponse(res, error);
  }
};