import { Request, Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { UserDocument, usersModel } from "../../models/user/user-schema";
import bcrypt from "bcryptjs";
import { generatePasswordResetToken, generatePasswordResetTokenByPhone, getPasswordResetTokenByToken } from "../../utils/mails/token";
import { httpStatusCode } from "../../lib/constant";
import { nestedQueryBuilder } from "src/utils";
import { ordersModel } from "../../models/orders/orders-schema";
import { deleteFileFromS3 } from "src/config/s3";
import { configDotenv } from "dotenv";

import { addedUserCreds, sendEmailVerificationMail, sendLoginCredentialsEmail, sendPasswordResetEmail } from "src/utils/mails/mail";
import { passwordResetTokenModel } from "src/models/password-token-schema";
import { generateOtpWithTwilio } from "src/utils/sms/sms";
import { generateUserToken, getSignUpQueryByAuthType, handleExistingUser, hashPasswordIfEmailAuth, sendOTPIfNeeded, validatePassword, validateUserForLogin } from "src/utils/userAuth/signUpAuth";
import { customAlphabet } from "nanoid";
import { awardsModel } from "src/models/awards/awards-schema";
import { readProgressModel } from "src/models/user-reads/read-progress-schema";

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


export const loginUserService = async (userData: UserDocument, authType: string, res: Response) => {

  let query = getSignUpQueryByAuthType(userData, authType);
  
  let user: any = await usersModel.findOne(query);

  if (!user && (authType === 'Google' || authType === 'Apple' || authType === 'Facebook')) {
      user = await createNewUser(userData, authType); // You should implement the createNewUser function as per your needs
  }

  let validationResponse = await validateUserForLogin(user, authType, userData, res);
  if (validationResponse) return validationResponse;

  if (authType === "Email") {
      let passwordValidationResponse = await validatePassword(userData, user.password, res);
      if (passwordValidationResponse) return passwordValidationResponse;
  }

  user.token = generateUserToken(user as any);
  
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
      token: generateUserToken(userData), 
  });

  await newUser.save();
  
  return newUser;
};

export const signUpService = async (userData: UserDocument, authType: string, res: Response) => {

    if (!authType) {
      return errorResponseHandler("Auth type is required", httpStatusCode.BAD_REQUEST, res);
    }

    // if (authType === "Email" && (!userData.password || !userData.email)) {
    //   return errorResponseHandler("Both email and password is required for Email authentication", httpStatusCode.BAD_REQUEST, res);
    // }

    const query = getSignUpQueryByAuthType(userData, authType);
    const existingUser = await usersModel.findOne(query);
    const existingUserResponse = existingUser ? handleExistingUser(existingUser as any, authType, res) : null;
    if (existingUserResponse) return existingUserResponse;

    const newUserData = { ...userData, authType };
    newUserData.password = await hashPasswordIfEmailAuth(userData, authType);
    const identifier = customAlphabet("0123456789", 5);
    (newUserData as any).identifier = identifier();
    const user = await usersModel.create(newUserData);
    await sendOTPIfNeeded(userData, authType);

    if (!process.env.AUTH_SECRET) {
      return errorResponseHandler("AUTH_SECRET is not defined", httpStatusCode.INTERNAL_SERVER_ERROR, res);
    }
    if((authType !== "Email") ) {
    user.token = generateUserToken(user as any);
    }
    await user.save();
    return { success: true, message: authType==="Email" ? "OTP sent for verification" : "Sign-up successfully", data: sanitizeUser(user) };

};

export const WhatsappLoginService = async (userData: UserDocument, authType: string, res: Response) => {

    if (!authType) {
      return errorResponseHandler("Auth type is required", httpStatusCode.BAD_REQUEST, res);
    }

    const existingUser = await usersModel.findOne({ phoneNumber: userData.phoneNumber });

    if (existingUser) {
      await sendOTPIfNeeded(userData, authType);  
      return { success: true, message: "OTP sent successfully", data: sanitizeUser(existingUser) };
    }

    // If user doesn't exist, create a new user
    const newUserData = { ...userData, authType };
    newUserData.password = await hashPasswordIfEmailAuth(userData, authType);
    const identifier = customAlphabet("0123456789", 5);
    (newUserData as any).identifier = identifier();

    // Create new user
    const user = await usersModel.create(newUserData);
    
    // Send OTP if needed for new user
    await sendOTPIfNeeded(userData, authType);

    if (!process.env.AUTH_SECRET) {
      return errorResponseHandler("AUTH_SECRET is not defined", httpStatusCode.INTERNAL_SERVER_ERROR, res);
    }

    // Generate token and save user
    // user.token = generateUserToken(user as any);
    await user.save();
    
    return { success: true, message: "OTP sent successfully", data: sanitizeUser(user) };
  
};


export const forgotPasswordUserService = async (payload: any, res: Response) => {
  const { email } = payload;
  const user = await usersModel.findOne({ email }).select("+password");
  if (!user) return errorResponseHandler("Email not found", httpStatusCode.NOT_FOUND, res);
  if(user.authType !== "Email") return errorResponseHandler(`Try login using ${user.authType}`, httpStatusCode.BAD_REQUEST, res);
  const passwordResetToken = await generatePasswordResetToken(email);

  if (passwordResetToken !== null) {
    await sendPasswordResetEmail(email, passwordResetToken.token, user.language);
    return { success: true, message: "Password reset email sent with otp" };
  }
};

export const newPassswordAfterOTPVerifiedUserService = async (payload: { password: string; otp: string }, res: Response) => {
  const { password, otp } = payload;

  const existingToken = await getPasswordResetTokenByToken(otp);
  if (!existingToken) return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);

  let existingUser: any;

  if (existingToken.email) {
    existingUser = await usersModel.findOne({ email: existingToken.email, authType: "Email" });
  } else if (existingToken.phoneNumber) {
    existingUser = await usersModel.findOne({ phoneNumber: existingToken.phoneNumber });
  }
  if (!existingUser) {
    return errorResponseHandler(`Please try login with ${existingUser.authType}`, httpStatusCode.BAD_REQUEST, res);
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const response = await usersModel.findByIdAndUpdate(existingUser._id, { password: hashedPassword }, { new: true });
  await passwordResetTokenModel.findByIdAndDelete(existingToken._id);

  return {
    success: true,
    message: "Password updated successfully",
    data: sanitizeUser(response),
  };
};

export const verifyOtpPasswordResetService = async (token: string, res: Response) => {
  const existingToken = await getPasswordResetTokenByToken(token);
  if (!existingToken) return errorResponseHandler("Invalid token", httpStatusCode.BAD_REQUEST, res);

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);
  return { success: true, message: "Token verified successfully" };
};

export const createUserService = async (payload: any, res: Response) => {
  const emailExists = await usersModel.findOne({ email: payload.email });
  if (emailExists) return errorResponseHandler("Email already exists", httpStatusCode.BAD_REQUEST, res);
  const phoneExists = await usersModel.findOne({
    phoneNumber: payload.phoneNumber,
  });
  if (phoneExists) return errorResponseHandler("Phone number already exists", httpStatusCode.BAD_REQUEST, res);

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

export const getUserService = async (id: string, res: Response) => {
  const user = await usersModel.findById(id);
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  const totalAmountPaidResult = await ordersModel.aggregate([{ $match: { userId: user._id } }, { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }]);
  const amountPaid = totalAmountPaidResult.length > 0 ? totalAmountPaidResult[0].totalAmount : 0;
  // Fetch all orders for the user
  const userOrders = await ordersModel.find({ userId: user._id }).populate({ path: "productIds", model: "products" });

  // Calculate the number of books purchased by the user
  const booksPurchasedCount = userOrders.reduce((count, order) => {
    return count + order.productIds.filter((product: any) => product.type === "e-book").length;
  }, 0);

  // Calculate the number of courses purchased by the user
  const courseCount = userOrders.reduce((count, order) => {
    return count + order.productIds.filter((product: any) => product.type === "course").length;
  }, 0);

  // Calculate the number of events attended by the user
  //  const eventsCount = await eventsModel.countDocuments({ userId: user._id });

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      data: user,
      amountPaid,
      booksPurchasedCount,
      courseCount,
      // Events,
    },
  };
};

export const updateUserService = async (id: string, payload: any, res: Response) => {
  const user = await usersModel.findById(id);
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

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
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

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

export const getUserProfileDetailService = async (id: string, payload: any, res: Response) => {
  const user = await usersModel.findById(id);
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

  const year = payload.duration;
  const userOrders = await ordersModel.find({ userId: id }).populate({
    path: "productIds",
    populate: [
      { path: "authorId", model: "authors" },
      { path: "categoryId", model: "categories" },
    ],
  });

  let filteredOrders = userOrders;

  if (year) {
    filteredOrders = userOrders.filter((order: any) => {
      const parsedDate = new Date(order.createdAt);
      if (isNaN(parsedDate.getTime())) {
        console.warn("Invalid createdAt for order:", order);
        return false;
      }

      const orderYear = parsedDate.getFullYear().toString();
      return orderYear === year;
    });
  }

  const totalAmountPaid = filteredOrders.reduce((acc, order) => acc + order.totalAmount, 0);

  const coursesPurchased = filteredOrders
    .flatMap((order) => order.productIds)
    .filter((product: any) => product?.type === "course")
    .map((product) => product._id);

  const booksPurchased = filteredOrders
    .flatMap((order) => order.productIds)
    .filter((product: any) => product?.type === "e-book")
    .map((product) => product._id);

  const booksPurchasedCount = booksPurchased.length;
  const coursesCount = coursesPurchased.length;

  return {
    success: true,
    message: "User profile details retrieved successfully",
    data: {
      user,
      userOrders: userOrders,
      totalAmountPaid: totalAmountPaid || 0,
      booksPurchasedCount: booksPurchasedCount || 0,
      coursesCount: coursesCount || 0,
      eventsCount: 0,
    },
  };
};

export const getAllUserService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  let { query, sort } = nestedQueryBuilder(payload, ["name", "email"]);

  if (payload.duration) {
    const durationDays = parseInt(payload.duration);
    if (durationDays === 30 || durationDays === 7) {
      const date = new Date();
      date.setDate(date.getDate() - durationDays);
      (query as any) = { ...query, createdAt: { $gte: date } };
    }
  }

  const totalDataCount = Object.keys(query).length < 1 ? await usersModel.countDocuments() : await usersModel.countDocuments(query);

  const users = await usersModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v -password -otp -token -fcmToken -whatsappNumberVerified -emailVerified");

  if (!users.length) {
    return {
      data: [],
      page,
      limit,
      success: false,
      message: "No users found",
      total: 0,
    };
  }

  const userIds = users.map((user) => user._id);
  const awards = await awardsModel.find({ userId: { $in: userIds } }).select("userId level badge");

  const awardsMap = new Map(awards.map((award) => [award.userId.toString(), award]));

  const results = users.map((user) => ({
    ...user.toObject(),
    award: awardsMap.get(user._id.toString()) || null,
  }));

  return {
    page,
    limit,
    success: true,
    message: "Users retrieved successfully",
    total: totalDataCount,
    data: results,
  };
};


export const generateAndSendOTP = async (payload: { email?: string; phoneNumber?: string }) => {
    const { email, phoneNumber } = payload;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // OTP expires in 20 minutes

    let user;
    if (email) {
      user = await usersModel.findOneAndUpdate(
        { email },
        {
          $set: {
            "otp.code": otp,
            "otp.expiresAt": expiresAt,
          },
        },
        { upsert: true, new: true }
      );
    } else if (phoneNumber) {
      user = await usersModel.findOneAndUpdate(
        { phoneNumber },
        {
          $set: {
            "otp.code": otp,
            "otp.expiresAt": expiresAt,
          },
        },
        { upsert: true, new: true }
      );
    }


    if (user) {
      // No need to call save if findOneAndUpdate handles the commit
      console.log('OTP successfully generated and saved for user: ', user);
    }

    // Send OTP via the respective method
    if (phoneNumber) {
      await generateOtpWithTwilio(phoneNumber, otp);
    }
    if (email) {
      await sendEmailVerificationMail(email, otp, user?.language || "en");
    }

    return { success: true, message: "OTP sent successfully" };
  } 
// };

export const verifyOTPService = async (payload: any) => {
  const { email, phoneNumber, otp } = payload;
 
  const user = await usersModel.findOne({
    $or: [{ email }, { phoneNumber }],
    "otp.code": otp,
    "otp.expiresAt": { $gt: new Date() },
  });

  if (!user) {
    throw new Error("Invalid or expired OTP");
  }

  if (user.otp) {
    user.otp.code = "";
    user.otp.expiresAt = new Date(0);
  }
  if (email) {
    user.emailVerified = true;
  }
  if (phoneNumber) {
    user.whatsappNumberVerified = true;
  }
  user.token = generateUserToken(user as any);
  await user.save();

  return { user: sanitizeUser(user), message: "OTP verified successfully" };
};

export const changePasswordService = async (userData: any, payload: any, res: Response) => {
  const { newPassword } = payload;
  const user = await usersModel.findById(userData.id).select("+password");
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();
  return {
    success: true,
    message: "Password updated successfully",
    data: sanitizeUser(user),
  };
};

export const getCurrentUserDetailsService = async (userData: any, res: Response) => {
  const user = await usersModel.findById(userData.id).select("-__v -password -otp -token -fcmToken -whatsappNumberVerified -emailVerified");
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  const award = await awardsModel.findOne({ userId: userData.id });
  const booksReadCount = await readProgressModel.countDocuments({ userId: userData.id, progress: 100 });

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      data: user,
      award,
      booksReadCount,
    },
  };
};
export const updateCurrentUserDetailsService = async (userData: any, payload: any, res: Response) => {
  const user = await usersModel.findById(userData.id);
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  const updatedUser = await usersModel
    .findByIdAndUpdate(userData.id, payload, {
      new: true,
    })
    .select("-__v -password -otp -token -fcmToken -whatsappNumberVerified -emailVerified");

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      data: updatedUser,
    },
  };
};
