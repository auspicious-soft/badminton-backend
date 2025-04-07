import { customAlphabet } from "nanoid";
import { passwordResetTokenModel } from "../../models/password-token-schema"



export const generatePasswordResetToken = async (phoneNumber: string | null, email: string | null) => {
  const genId = customAlphabet('0123456789', 6)
  const token = genId()
  const expires = new Date(new Date().getTime() + 3600 * 1000)

  const existingToken = await passwordResetTokenModel.findOne({ $or: [{ phoneNumber }, { email }] })
  if (existingToken) {
    await passwordResetTokenModel.findByIdAndDelete(existingToken._id)
  }
  const newPasswordResetToken = new passwordResetTokenModel({
    phoneNumber,
    token,
    expires,
    email
  })
  const response = await newPasswordResetToken.save()
  return response
}

export const getPasswordResetTokenByToken = async (token: string) => {
  try {
    const passwordResetToken = await passwordResetTokenModel.findOne({ token });
    return passwordResetToken;
  } catch {
    return null;
  }
}

export const generatePasswordResetTokenByPhone = async(phoneNumber: string) => {
  const genId = customAlphabet('0123456789', 6)
  const token = genId()
  const expires = new Date(new Date().getTime() + 3600 * 1000)

  const existingToken = await passwordResetTokenModel.findOne({ phoneNumber })
  if (existingToken) {
    await passwordResetTokenModel.findByIdAndDelete(existingToken._id)
  }
  const newPasswordResetToken = new passwordResetTokenModel({
    phoneNumber,
    token,
    expires
  })
  const response = await newPasswordResetToken.save()
  return response
}