import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { UserDocument, usersModel } from "../../models/user/user-schema";
import bcrypt from "bcryptjs";
import {
  generatePasswordResetToken,
  getPasswordResetTokenByToken,
} from "../../utils/mails/token";
import { httpStatusCode } from "../../lib/constant";
import { createS3Client, deleteFileFromS3 } from "src/config/s3";
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
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import { Readable } from "stream";
import { adminSettingModel } from "src/models/admin/admin-settings";
import { transactionModel } from "src/models/admin/transaction-schema";
import { notifyUser } from "src/utils/FCM/FCM";
import { chatModel } from "src/models/chat/chat-schema";
import { notificationModel } from "src/models/notification/notification-schema";
import axios from "axios";

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

  if (
    !user &&
    (authType === "Google" || authType === "Apple" || authType === "Facebook")
  ) {
    user = await createNewUser({...userData, emailVerified: true}, authType); // You should implement the createNewUser function as per your needs
  }
  const todayDate = new Date();
  const isDeleted =
    user?.isBlocked &&
    user?.permanentBlackAfter &&
    user.permanentBlackAfter < todayDate;
  if (!user || isDeleted) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (
    user?.isBlocked &&
    user.permanentBlackAfter &&
    user.permanentBlackAfter > todayDate
  ) {
    user.isBlocked = false;
    user.permanentBlackAfter = null;
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
  if (!user?.fcmToken?.includes(userData?.fcmToken)) {
    user.fcmToken.push(userData.fcmToken);
  }
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
  const { idToken, location, fcmToken, accessToken } = userData;

  const data = accessToken
    ? await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    : null;
  const decodedToken = data ? data.data : (jwt.decode(idToken) as any);

  if (!decodedToken) {
    throw new Error("Something went wrong");
  }

  const { email, given_name, family_name, picture } = decodedToken;

  // Create fullName from given_name and family_name
  const fullName = `${given_name || email?.split("@")[0] || ""} ${
    family_name || ""
  }`.trim();

  const result = await loginUserService(
    {
      email,
      firstName: given_name || fullName,
      lastName: family_name,
      fullName: fullName, // Add fullName
      profilePic: authType === "Apple" ? "profiles/image (2).png" : picture,
      location,
      emailVerified: true,
      fcmToken: fcmToken,
    },
    authType,
    res
  );

  return result;
};

const createNewUser = async (userData: any, authType: string) => {
  // Set fullName from firstName and lastName
  const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const fullName = `${capitalize(userData?.firstName || "")} ${capitalize(
    userData.lastName || ""
  )}`.trim();

  let newUser = new usersModel({
    email: userData.email,
    lastName: userData.lastName,
    firstName: userData.firstName,
    fullName: fullName || null, // Use computed fullName or null if empty
    authType: authType,
    fcmToken: userData.fcmToken,
    profilePic: userData.profilePic,
    password: null,
    emailVerified: userData.emailVerified || false,
    location: userData.location || { type: "Point", coordinates: [0, 0] },
    token: generateUserToken(userData, true),
  });

  await newUser.save();

  let referralCode: string = "";
  let exist = true;
  while (exist) {
    const prefix = userData?.firstName
      ? userData.firstName.slice(0, 2).toUpperCase()
      : "PL";
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

    referralCode = `${prefix}${randomSuffix}`;
    const existingCode = await additionalUserInfoModel.findOne({
      "referrals.code": referralCode,
    });

    exist = !!existingCode;
  }

  // Create additional user info document
  await additionalUserInfoModel.create({
    userId: newUser._id,
    playCoins: 0,
    loyaltyPoints: 0,
    loyaltyTier: "Bronze",
    referrals: {
      code: referralCode,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Valid for 1 year
      usageCount: 0,
      maxUsage: 15,
      isActive: true,
    },
    notificationPreferences: {
      gameInvites: true,
      friendRequests: true,
      bookingReminders: true,
      promotions: true,
      systemUpdates: true,
      nearbyEvents: true,
    },
    clubMember: false,
    playerRating: 0,
  });

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
    const first = userData.firstName || "";
    const last = userData.lastName || "";

    const capitalize = (str: string) =>
      str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    userData.fullName = `${capitalize(first)} ${capitalize(last)}`.trim();
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
  if (userData?.fcmToken) {
    newUserData.fcmToken = userData.fcmToken;
  } else {
    newUserData.fcmToken = [];
  }
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

  let referralCode: string = "";
  let exist = true;
  while (exist) {
    const prefix = userData?.firstName
      ? userData.firstName.slice(0, 2).toUpperCase()
      : "PL";
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

    referralCode = `${prefix}${randomSuffix}`;
    const existingCode = await additionalUserInfoModel.findOne({
      "referrals.code": referralCode,
    });

    exist = !!existingCode;
  }

  // Create additional user info document with the unique referral code
  await additionalUserInfoModel.create({
    userId: user._id,
    playCoins: 0,
    loyaltyPoints: 0,
    loyaltyTier: "Bronze",
    referrals: {
      code: referralCode,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Valid for 1 year
      usageCount: 0,
      maxUsage: 15,
      isActive: true,
    },
    notificationPreferences: {
      gameInvites: true,
      friendRequests: true,
      bookingReminders: true,
      promotions: true,
      systemUpdates: true,
      nearbyEvents: true,
    },
    clubMember: false,
    playerRating: 0,
  });

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
  const { email, phoneNumber } = payload;

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email) && email.length != 10) {
      return errorResponseHandler(
        "Invalid email format",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  } else if (email.length != 10) {
    return errorResponseHandler(
      "Invalid phone number",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const user = await usersModel
    .findOne({ $or: [{ email }, { phoneNumber: email }] })
    .select("+password");
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
  if (email.length == 10 && passwordResetToken) {
    // await generateTwilioVerificationOTP(
    //   phoneNumber,
    //   passwordResetToken.token,
    //   passwordResetToken.expires
    // );

    try {
      await fetch(
        `https://2factor.in/API/V1/${process.env.Two_Factor_Key}/SMS/+91${email}/${passwordResetToken.token}/Rest Password`,
        {
          method: "GET",
        }
      );
    } catch (e) {
      throw new Error("Error sending OTP");
    }
  }

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
  const newUser = new usersModel(payload);
  await addedUserCreds(newUser);
  newUser.password = await hashPasswordIfEmailAuth(payload, "Email");
  const identifier = customAlphabet("0123456789", 5);
  (newUser as any).identifier = identifier();

  const response = await newUser.save();

  // Create additional user info document
  await additionalUserInfoModel.create({
    userId: response._id,
    playCoins: 0,
    loyaltyPoints: 0,
    loyaltyTier: "Bronze",
    notificationPreferences: {
      gameInvites: true,
      friendRequests: true,
      bookingReminders: true,
      promotions: true,
      systemUpdates: true,
      nearbyEvents: true,
    },
    clubMember: false,
    playerRating: 0,
  });

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
  }

  // Send OTP via the respective method
  if (phoneNumber) {
    // await generateOtpWithTwilio(phoneNumber, otpPhone);
    try {
      await fetch(
        `https://2factor.in/API/V1/${process.env.Two_Factor_Key}/SMS/+91${phoneNumber}/${otpPhone}/REGISTER`,
        {
          method: "GET",
        }
      );
    } catch (e) {
      throw new Error("Error sending OTP");
    }
    // await generateTwilioVerificationOTP(phoneNumber, otpPhone, expiresAt);
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
    if (user?.referralUsed) {
      let bonusAmount = await adminSettingModel.findOne().lean();
      const referredPerson = await additionalUserInfoModel.findOne({
        "referrals.code": user?.referralUsed,
      });

      if (referredPerson && bonusAmount?.referral?.enabled) {
        referredPerson.referrals.usageCount += 1;
        referredPerson.playCoins += bonusAmount?.referral?.bonusAmount || 50; // Assuming 100 coins for referral
        await referredPerson.save();
        await transactionModel.create({
          userId: referredPerson.userId,
          amount: bonusAmount?.referral?.bonusAmount || 50,
          status: "received",
          text: "Referral bonus received",
        });
        await notifyUser({
          recipientId: referredPerson.userId,
          type: "REFERRAL_SUCCESSFUL",
          title: "Referral Bonus Received",
          message: `You have received ${
            bonusAmount?.referral?.bonusAmount || 50
          } coins for referring a friend!`,
          category: "FRIEND",
          priority: "HIGH",
          referenceType: "User",
          metadata: { referralCode: user?.referralUsed },
        });
      } else {
        errorResponseHandler(
          "Invalid referral code",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
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
    return { data: sanitizeUser(user), message: "Email verified successfully" };
  }

  if (phoneOtp) {
    const user = await usersModel.findOne({
      _id: userData.id,
      "otp.phoneCode": phoneOtp,
      "otp.expiresAt": { $gt: new Date() },
    });

    if (!user) {
      errorResponseHandler(
        "Invalid or expired Phone OTP",
        httpStatusCode.BAD_REQUEST,
        res
      );
    } else {
      user.phoneVerified = true;
      if (user.otp) {
        user.otp.phoneCode = "";
        user.otp.expiresAt = new Date(0);
      }

      user.token = generateUserToken(user as any, true);
      await user.save();
      return {
        data: sanitizeUser(user),
        message: "Phone number verified successfully",
      };
    }
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
    .select("playCoins loyaltyTier referrals freeGameCount loyaltyPoints");

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

  const messageCount = await chatModel
    .find({
      participants: { $in: [userId] },
    })
    .lean();

  let totalMessage = 0;

  if (messageCount && messageCount.length > 0) {
    messageCount.forEach((chat: any) => {
      if (chat?.messages && chat?.messages?.length > 0) {
        let lastIndx = chat.messages.length - 1;
        if (
          !chat?.messages[lastIndx].readBy.some((id: mongoose.Types.ObjectId) =>
            id.equals(userId)
          )
        ) {
          totalMessage += 1;
        }
      }
    });
  }

  const unreadNotifications = await notificationModel
    .find({
      recipientId: userId,
      isRead: false,
    })
    .countDocuments();

  const rewardCoins = await adminSettingModel.findOne({ isActive: true });

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      ...user,
      totalMatches,
      totalFriends,
      playCoins: additionalInfo?.playCoins || 0,
      freeGameCount: additionalInfo?.freeGameCount || 0,
      loyaltyTier: additionalInfo?.loyaltyTier || "Bronze",
      loyaltyPoints: additionalInfo?.loyaltyPoints || 0,
      unreadChats: totalMessage || 0,
      unreadNotifications: unreadNotifications || 0,
      referrals: additionalInfo?.referrals?.isActive
        ? {
            ...additionalInfo?.referrals,
            rewardCoins: rewardCoins?.referral?.bonusAmount,
          }
        : {
            code: "",
            expiryDate: new Date(),
            usageCount: 0,
            maxUsage: 15,
            rewardCoins: rewardCoins?.referral?.bonusAmount,
            isActive: true,
          },
    },
  };
};
export const updateUserServices = async (req: Request, res: Response) => {
  const userData = req.user as any;
  const userId = userData.id;
  const { firstName, lastName, profilePic, oldPassword, password } = req.body;

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

  // If firstName or lastName is provided, update them and create fullName
  if (firstName || lastName) {
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;

    // Create fullName from firstName and lastName
    const newFirstName = firstName || user.firstName || "";
    const newLastName = lastName || user.lastName || "";
    updateFields.fullName = `${newFirstName} ${newLastName}`.trim();
  }

  // Delete previous profile pic from S3 if a new one is provided
  if (profilePic && user.profilePic && user.profilePic !== profilePic) {
    try {
      await deleteFileFromS3(user.profilePic);
    } catch (error) {
      console.error("Error deleting previous profile picture:", error);
      // Continue with the update even if deletion fails
    }
    updateFields.profilePic = profilePic;
  } else if (profilePic) {
    updateFields.profilePic = profilePic;
  }

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

export const uploadStreamToS3Service = async (
  fileStream: Readable,
  fileName: string,
  fileType: string,
  userEmail: string
): Promise<string> => {
  const timestamp = Date.now();
  const imageKey = `users/${userEmail}/images/${timestamp}-${fileName}`;

  // Convert stream to buffer
  const chunks: any[] = [];
  for await (const chunk of fileStream) {
    chunks.push(chunk);
  }
  const fileBuffer = Buffer.concat(chunks);

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: imageKey,
    Body: fileBuffer,
    ContentType: fileType,
  };

  const s3Client = createS3Client();
  const command = new PutObjectCommand(params);
  await s3Client.send(command);

  return imageKey;
};

export const getAppInfoServices = async (req: Request, res: Response) => {
  const getInfo = await adminSettingModel.findOne();
  return {
    success: true,
    message: "Data fetched successfully",
    data: getInfo,
  };
};
