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
import { generateTwilioVerificationOTP } from "src/utils/sms/sms";
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
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { bookingModel } from "src/models/venue/booking-schema";
import { friendsModel } from "src/models/user/friends-schema";

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
  userData: UserDocument | any,
  authType: string,
  res: Response
) => {
  let user: any = await usersModel.findOne({
    $or: [
      { email: userData?.email?.toLowerCase() },
      { phoneNumber: userData?.email },
    ],
  });

  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (
    !user &&
    (authType === "Google" || authType === "Apple" || authType === "Facebook")
  ) {
    user = await createNewUser(userData, authType); // You should implement the createNewUser function as per your needs
  }

  if (authType !== user.authType) {
    return errorResponseHandler(
      `Wrong Login method!!, Try login from ${user.authType}`,
      httpStatusCode.BAD_REQUEST,
      res
    );
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

export const socialLoginService = async (
  userData: any,
  authType: any,
  res: Response
) => {
  const { idToken, location } = userData;

  const decodedToken = jwt.decode(idToken) as any;

  const { email, given_name, family_name, picture } = decodedToken;

  // Create fullName from given_name and family_name
  const fullName = `${given_name || ""} ${family_name || ""}`.trim();

  const result = await loginUserService(
    {
      email,
      firstName: given_name,
      lastName: family_name,
      fullName: fullName, // Add fullName
      profilePic: picture,
      location,
      emailVerified: true,
    },
    authType,
    res
  );

  return result;
};

const createNewUser = async (userData: any, authType: string) => {
  // Set fullName from firstName and lastName
  const fullName = `${userData.firstName || ""} ${
    userData.lastName || ""
  }`.trim();

  let newUser = new usersModel({
    email: userData.email,
    lastName: userData.lastName,
    firstName: userData.firstName,
    fullName: fullName || null, // Use computed fullName or null if empty
    authType: authType,
    fcmToken: userData.fcmToken,
    profilePic: userData.profilePic,
    password: null,
    location: userData.location || { type: "Point", coordinates: [0, 0] },
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

  if (authType === "Email-Phone") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (userData.email && !emailRegex.test(userData.email)) {
      return errorResponseHandler(
        "Invalid email format",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Set fullName if firstName and/or lastName are provided
  if (!userData.fullName && (userData.firstName || userData.lastName)) {
    userData.fullName = `${userData.firstName || ""} ${
      userData.lastName || ""
    }`.trim();
  }

  const query = getSignUpQueryByAuthType(userData, authType);
  const existingUser = await usersModel.findOne(query);

  const existingUserResponse =
    existingUser && existingUser?.emailVerified
      ? handleExistingUser(existingUser as any, authType, res)
      : existingUser && existingUser?.emailVerified === false
      ? await usersModel.deleteOne({ _id: existingUser._id }).lean()
      : null;

  if (existingUserResponse && existingUserResponse?.acknowledged === false)
    return existingUserResponse;
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
  const { email } = payload;

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return errorResponseHandler(
        "Invalid email format",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }
  const user = await usersModel.findOne({ email }).select("+password");
  if (!user)
    return errorResponseHandler(
      "User not found",
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

  // Generate the password reset token
  const passwordResetToken = await generatePasswordResetToken(email, "");

  // Send OTP via email if email is provided
  if (email && passwordResetToken) {
    await sendEmailVerificationMail(email, passwordResetToken.token, "eng");
  }

  // Send OTP via SMS if phone number is provided
  // if (phoneNumber && passwordResetToken) {
  //   await generateTwilioVerificationOTP(
  //     phoneNumber,
  //     passwordResetToken.token,
  //     passwordResetToken.expires
  //   );
  // }

  let verification = false;
  let token = generateUserToken(user as any, verification);

  return {
    success: true,
    token,
    message: "Password reset OTP sent to your email",
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

  // const hasExpired = new Date(existingToken.expires) < new Date();
  // if (hasExpired)
  //   return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);

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
    return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);

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
    return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);

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

  // Set fullName if firstName and/or lastName are provided
  if (!payload.fullName && (payload.firstName || payload.lastName)) {
    payload.fullName = `${payload.firstName || ""} ${
      payload.lastName || ""
    }`.trim();
  }

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
  // Change expiry time to 2 minutes
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // OTP expires in 2 minutes

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
    await generateTwilioVerificationOTP(phoneNumber, otpPhone, expiresAt);
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
      // errorResponseHandler(
      //   "Invalid or expired Email OTP",
      //   httpStatusCode.BAD_REQUEST,
      //   res
      // );
      throw new Error("Invalid or expired Email OTP");
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

export const getUserServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const userId = userData.id;
  const user = await usersModel
    .findById(userId)
    .lean()
    .select("-__v -password -otp");
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get additional user info
  const additionalInfo = await additionalUserInfoModel
    .findOne({ userId: userId })
    .lean()
    .select("playCoins loyaltyTier");

  // Get total matches played
  const totalMatches = await bookingModel.countDocuments({
    $or: [
      { "team1.playerId": new mongoose.Types.ObjectId(userId) },
      { "team2.playerId": new mongoose.Types.ObjectId(userId) },
    ],
  });

  // Get total friends
  const totalFriends = await friendsModel.countDocuments({
    $or: [
      { userId: userId, status: "accepted" },
      { friendId: userId, status: "accepted" },
    ],
  });

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      ...user,
      totalMatches,
      totalFriends,
      playCoins: additionalInfo?.playCoins || 0,
      loyaltyTier: additionalInfo?.loyaltyTier || "Bronze",
    },
  };
};
export const updateUserServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const userId = userData.id;
  const { fullName, profilePic, oldPassword, password } = req.body;

  // Check if user exists
  const user = await usersModel.findById(userId).select("+password");
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Create update object with only provided fields
  const updateFields: any = {};

  // If fullName is provided, update fullName and split into firstName/lastName
  if (fullName) {
    updateFields.fullName = fullName;

    // Split fullName into firstName and lastName
    const nameParts = fullName.trim().split(" ");
    if (nameParts.length > 0) {
      updateFields.firstName = nameParts[0];

      // If there are multiple parts, join the rest as lastName
      if (nameParts.length > 1) {
        updateFields.lastName = nameParts.slice(1).join(" ");
      } else {
        updateFields.lastName = ""; // Clear lastName if only one name provided
      }
    }
  }

  if (profilePic) updateFields.profilePic = profilePic;

  // Verify old password and update password if provided
  if (password) {
    // If trying to update password, old password is required
    if (!oldPassword) {
      return errorResponseHandler(
        "Old password is required to update password",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(
      oldPassword || "",
      user.password || ""
    );
    if (!isPasswordValid) {
      return errorResponseHandler(
        "Current password is incorrect",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Hash and set new password
    updateFields.password = await bcrypt.hash(password, 10);
  }

  // Update user
  const updatedUser = await usersModel
    .findByIdAndUpdate(userId, updateFields, { new: true })
    .select("-__v -password -otp");

  // Get additional user info
  const additionalInfo = await additionalUserInfoModel
    .findOne({ userId })
    .lean()
    .select("playCoins loyaltyTier");

  // Get total matches played
  const totalMatches = await bookingModel.countDocuments({
    $or: [
      { "team1.playerId": new mongoose.Types.ObjectId(userId) },
      { "team2.playerId": new mongoose.Types.ObjectId(userId) },
    ],
  });

  // Get total friends
  const totalFriends = await friendsModel.countDocuments({
    $or: [
      { userId, status: "accepted" },
      { friendId: userId, status: "accepted" },
    ],
  });

  // Return enhanced user data
  return {
    success: true,
    message: "User updated successfully",
    data: {
      ...(updatedUser?.toObject() || {}),
      totalMatches,
      totalFriends,
      playCoins: additionalInfo?.playCoins || 0,
      loyaltyTier: additionalInfo?.loyaltyTier || "Bronze",
    },
  };
};
