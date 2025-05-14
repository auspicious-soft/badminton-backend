import { customAlphabet } from "nanoid";
import { passwordResetTokenModel } from "../../models/password-token-schema";
import { getCurrentISTTime } from "../index";

export const generatePasswordResetToken = async (
  email: string | null,
  phoneNumber: string | null
) => {
  console.log("phoneNumber: ", phoneNumber);
  console.log("email: ", email);
  const genId = customAlphabet("0123456789", 6);
  const token = genId();
  
  // Get current time in IST
  const currentTime = getCurrentISTTime();
  
  // Set expiry to 2 minutes from current IST time
  const expires = new Date(currentTime.getTime() + 2 * 60 * 1000);
  
  console.log(`Generated token at ${currentTime.toISOString()} IST, expires at ${expires.toISOString()} IST`);

  if (!phoneNumber && !email) {
    throw new Error("Either phone number or email is required");
  }

  const existingToken = await passwordResetTokenModel.findOne({
    $or: [{ phoneNumber }, { email }],
  });
  console.log("existingToken: ", existingToken);
  if (existingToken) {
    await passwordResetTokenModel.findByIdAndDelete(existingToken._id);
  }

  const tokenData = {
    phoneNumber: phoneNumber || null,
    token,
    expires,
    email: email || null,
  };

  const newPasswordResetToken = new passwordResetTokenModel(tokenData);
  await newPasswordResetToken.save();

  return newPasswordResetToken;
};

export const getPasswordResetTokenByToken = async (token: string) => {
  try {
    const passwordResetToken = await passwordResetTokenModel.findOne({ token });
    return passwordResetToken;
  } catch {
    return null;
  }
};

export const generatePasswordResetTokenByPhone = async (
  phoneNumber: string
) => {
  const genId = customAlphabet("0123456789", 6);
  const token = genId();
  // Change expiry time to 2 minutes
  const expires = new Date(new Date().getTime() + 2 * 60 * 1000);

  const existingToken = await passwordResetTokenModel.findOne({ phoneNumber });
  if (existingToken) {
    await passwordResetTokenModel.findByIdAndDelete(existingToken._id);
  }
  const newPasswordResetToken = new passwordResetTokenModel({
    phoneNumber,
    token,
    expires,
  });
  const response = await newPasswordResetToken.save();
  return response;
};
