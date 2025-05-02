import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { UserDocument, usersModel } from "../../models/user/user-schema";
import bcrypt from "bcryptjs";
import {
  generatePasswordResetToken,
  getPasswordResetTokenByToken,
} from "../../utils/mails/token";
import { httpStatusCode } from "../../lib/constant";
import { deleteFileFromS3 } from "src/config/s3";
import { configDotenv } from "dotenv";

import {
  addedUserCreds,
  sendEmailVerificationMail,
} from "src/utils/mails/mail";
import { passwordResetTokenModel } from "src/models/password-token-schema";
import { generatePasswordResetTokenByPhoneWithTwilio } from "src/utils/sms/sms";
import {
  generateUserToken,
  getSignUpQueryByAuthType,
  handleExistingUser,
  hashPasswordIfEmailAuth,
  sendOTPIfNeeded,
  validatePassword,
  validateUserForLogin,
} from "src/utils/userAuth/signUpAuth";
import { customAlphabet } from "nanoid";

configDotenv();
export interface UserPayload {
  _id?: string;
  email: string;
  fullName: string;
  password?: string;
  phoneNumber?: string;
  language?: string;
  authType?: string;
  role?: string;
}

const sanitizeUser = (user: any): UserDocument => {
  const sanitized = user.toObject();
  delete sanitized.password;
  delete sanitized.otp;
  return sanitized;
};

export const loginUserService = async (
  userData: UserDocument,
  authType: string,
  res: Response
) => {
  let user: any = await usersModel.findOne({
    $or: [
      { email: userData?.email?.toLowerCase() },
      { phoneNumber: userData?.email },
    ],
  });

  if (
    !user &&
    (authType === "Google" || authType === "Apple" || authType === "Facebook")
  ) {
    user = await createNewUser(userData, authType); // You should implement the createNewUser function as per your needs
  }

  let validationResponse = await validateUserForLogin(
    user,
    user.authType,
    userData,
    res
  );
  if (validationResponse) return validationResponse;

  if (authType === "Email-Phone") {
    let passwordValidationResponse = await validatePassword(
      userData,
      user.password,
      res
    );
    if (passwordValidationResponse) return passwordValidationResponse;
  }
  user.token = generateUserToken(user as any, true);
  await user.save();
  return {
    success: true,
    message: "Logged in successfully",
    data: sanitizeUser(user),
  };
};

const createNewUser = async (userData: any, authType: string) => {
  let newUser = new usersModel({
    email: userData.email,
    lastName: userData.lastName,
    firstName: userData.firstName,
    authType: authType,
    fcmToken: userData.fcmToken,
    profilePic: userData.profilePic,
    password: null,
    token: generateUserToken(userData, true),
  });

  await newUser.save();

  return newUser;
};

export const signUpService = async (
  userData: UserDocument,
  authType: string,
  res: Response
) => {
  if (!authType) {
    return errorResponseHandler(
      "Auth type is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (authType === "Email-Phone" && !userData.password) {
    return errorResponseHandler(
      "Password is required for Email and Phone authentication",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const query = getSignUpQueryByAuthType(userData, authType);
  const existingUser = await usersModel.findOne(query);
  const existingUserResponse = existingUser
    ? handleExistingUser(existingUser as any, authType, res)
    : null;
  if (existingUserResponse) return existingUserResponse;
  const newUserData = { ...userData, authType };
  newUserData.password = await hashPasswordIfEmailAuth(userData, authType);
  const user = await usersModel.create(newUserData);
  const otp = await sendOTPIfNeeded(userData, authType);

  if (!process.env.AUTH_SECRET) {
    return errorResponseHandler(
      "AUTH_SECRET is not defined",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
  let verification = false;
  user.token = generateUserToken(user as any, verification);

  await user.save();
  return {
    success: true,
    message:
      authType === "Email"
        ? "OTP sent for verification"
        : "Sign-up successfully",
    data: sanitizeUser(user),
    otp: otp?.otp || [],
  };
};

export const forgotPasswordUserService = async (
  payload: any,
  res: Response
) => {
  const { phoneNumber, email } = payload;
  const user = await usersModel
    .findOne({ $or: [{ email }, { phoneNumber }] })
    .select("+password");
  if (!user)
    return errorResponseHandler(
      "Phone number not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  if (
    user.authType !== "Email" &&
    user.authType !== "Phone" &&
    user.authType !== "Email-Phone"
  )
    return errorResponseHandler(
      `Try login using ${user.authType}`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  await generatePasswordResetToken(email, phoneNumber);

  let verification = false;
  let token = generateUserToken(user as any, verification);

  return {
    success: true,
    token,
    message: "Password reset email sent with otp",
  };
};

export const newPassswordAfterOTPVerifiedUserService = async (
  payload: { password: string; otp: string },
  res: Response,
  req: Request
) => {
  const userData = req.user as any;
  const { password, otp } = payload;

  const existingToken = await passwordResetTokenModel.findOne({
    $or: [{ phoneNumber: userData.phoneNumber }, { email: userData.email }],
  });

  // const existingToken = await getPasswordResetTokenByToken(otp);
  if (!existingToken || !existingToken.isVerified)
    return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired)
    return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);

  let existingUser: any;

  if (existingToken.email) {
    existingUser = await usersModel.findOne({ email: existingToken.email });
  } else if (existingToken.phoneNumber) {
    existingUser = await usersModel.findOne({
      phoneNumber: existingToken.phoneNumber,
    });
  }
  if (!existingUser) {
    return errorResponseHandler(
      `Please try login with ${existingUser.authType}`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const response = await usersModel
    .findByIdAndUpdate(
      existingUser._id,
      { password: hashedPassword },
      { new: true }
    )
    .lean();
  let token = generateUserToken(response as any, true);

  await passwordResetTokenModel.findByIdAndDelete(existingToken._id);

  return {
    success: true,
    message: "Password updated successfully",
  };
};

export const verifyOtpPasswordResetService = async (
  token: string,
  res: Response
) => {
  const existingToken = await getPasswordResetTokenByToken(token);
  if (!existingToken)
    return errorResponseHandler(
      "Invalid token",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired)
    return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);
  return { success: true, message: "Token verified successfully" };
};

export const verifyOtpPasswordForgetService = async (
  token: string,
  res: Response
) => {
  const existingToken = await getPasswordResetTokenByToken(token);
  if (!existingToken)
    return errorResponseHandler(
      "Invalid token",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired)
    return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);

  await passwordResetTokenModel.findByIdAndUpdate(existingToken._id, {
    isVerified: true,
  });

  return { success: true, message: "Token verified successfully" };
};

export const createUserService = async (payload: any, res: Response) => {
  const emailExists = await usersModel.findOne({ email: payload.email });
  if (emailExists)
    return errorResponseHandler(
      "Email already exists",
      httpStatusCode.BAD_REQUEST,
      res
    );
  const phoneExists = await usersModel.findOne({
    phoneNumber: payload.phoneNumber,
  });
  if (phoneExists)
    return errorResponseHandler(
      "Phone number already exists",
      httpStatusCode.BAD_REQUEST,
      res
    );

  // Hash the password before saving the user
  // const hashedPassword = bcrypt.hashSync(payload.password, 10);
  // payload.password = hashedPassword;
  const newUser = new usersModel(payload);
  await addedUserCreds(newUser);
  newUser.password = await hashPasswordIfEmailAuth(payload, "Email");
  const identifier = customAlphabet("0123456789", 5);
  (newUser as any).identifier = identifier();

  const response = await newUser.save();

  return {
    success: true,
    message: "User created successfully",
    data: response,
  };
};

export const updateUserService = async (
  id: string,
  payload: any,
  res: Response
) => {
  const user = await usersModel.findById(id);
  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  const updatedUser = await usersModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  return {
    success: true,
    message: "User updated successfully",
    data: updatedUser,
  };
};

export const deleteUserService = async (id: string, res: Response) => {
  const user = await usersModel.findById(id);
  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  const deletedUser = await usersModel.findByIdAndDelete(id);
  if (deletedUser?.profilePic) {
    await deleteFileFromS3(deletedUser?.profilePic);
  }
  return {
    success: true,
    message: "User deleted successfully",
    data: deletedUser,
  };
};

export const generateAndSendOTP = async (
  authType: string,
  payload: { email?: string | null; phoneNumber?: string | null }
) => {
  const { email, phoneNumber } = payload;

  const otpEmail = Math.floor(100000 + Math.random() * 900000).toString();
  const otpPhone = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // OTP expires in 20 minutes

  let user;
  if (email) {
    user = await usersModel.findOneAndUpdate(
      { email },
      {
        $set: {
          "otp.emailCode": otpEmail,
          "otp.expiresAt": expiresAt,
        },
      },
      { upsert: true, new: true }
    );
  }

  if (phoneNumber) {
    user = await usersModel.findOneAndUpdate(
      { phoneNumber },
      {
        $set: {
          "otp.phoneCode": otpPhone,
          "otp.expiresAt": expiresAt,
        },
      },
      { upsert: true, new: true }
    );
  }

  if (user) {
    // No need to call save if findOneAndUpdate handles the commit
    console.log("OTP successfully generated and saved for user: ", user);
  }

  // Send OTP via the respective method
  if (phoneNumber) {
    // await generateOtpWithTwilio(phoneNumber, otpPhone);
    await generatePasswordResetTokenByPhoneWithTwilio(
      phoneNumber,
      otpPhone,
      expiresAt
    );
  }
  if (email) {
    await sendEmailVerificationMail(email, otpEmail, "eng");
  }
  return {
    success: true,
    message: "OTP sent successfully",
    otp: [otpEmail, otpPhone],
  };
};

export const verifyOTPService = async (
  payload: any,
  req: Request,
  res: Response
) => {
  const { emailOtp, phoneOtp } = payload;

  if (emailOtp && phoneOtp) {
    errorResponseHandler(
      "Both Email and Phone OTP cannot be verified at once",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (!emailOtp && !phoneOtp) {
    errorResponseHandler("OTP is required", httpStatusCode.BAD_REQUEST, res);
  }

  const userData = req.user as any;

  if (emailOtp) {
    let user = await usersModel.findOne({
      _id: userData.id,
      "otp.emailCode": emailOtp,
      "otp.expiresAt": { $gt: new Date() },
    });

    if (!user) {
      errorResponseHandler(
        "Invalid or expired Email OTP",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    if (user) {
      user.emailVerified = true;
    }
    if (user?.otp) {
      user.otp.emailCode = "";
    }
    if (user) {
      await user.save();
    }
    return { user: sanitizeUser(user), message: "Email verified successfully" };
  }

  if (phoneOtp) {
    let user = await usersModel.findOne({
      _id: userData.id,
      "otp.phoneCode": phoneOtp,
      "otp.expiresAt": { $gt: new Date() },
    });

    if (!user) {
      throw new Error("Invalid or expired Phone OTP");
    }
    user.phoneVerified = true;
    if (user.otp) {
      user.otp.phoneCode = "";
      user.otp.expiresAt = new Date(0);
    }

    user.token = generateUserToken(user as any, true);
    await user.save();
    return {
      user: sanitizeUser(user),
      message: "Phone number verified successfully",
    };
  }
};

export const changePasswordService = async (
  userData: any,
  payload: any,
  res: Response
) => {
  const { newPassword } = payload;
  const user = await usersModel.findById(userData.id).select("+password");
  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();
  return {
    success: true,
    message: "Password updated successfully",
    data: sanitizeUser(user),
  };
};

export const updateCurrentUserDetailsService = async (
  userData: any,
  payload: any,
  res: Response
) => {
  const user = await usersModel.findById(userData.id);
  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  const updatedUser = await usersModel
    .findByIdAndUpdate(userData.id, payload, {
      new: true,
    })
    .select(
      "-__v -password -otp -token -fcmToken -whatsappNumberVerified -emailVerified"
    );

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      data: updatedUser,
    },
  };
};
