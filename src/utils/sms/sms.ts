// import twilio
import { customAlphabet } from "nanoid";
import { passwordResetTokenModel } from "../../models/password-token-schema";
import twilio from "twilio";
import { configDotenv } from "dotenv";
configDotenv();
// const client = twilio(process.env.ACCOUNTSID as string, process.env.AUTHTOKEN as string);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

// export const generatePasswordResetTokenByPhoneWithTwilio = async (phoneNumber: string ,token: string) => {

//   try {
//     const genId = customAlphabet('0123456789', 6);
//     const token = genId();
//     const expires = new Date(new Date().getTime() + 3600 * 1000); // Token valid for 1 hour

//     const existingToken = await passwordResetTokenModel.findOne({ phoneNumber });
//     if (existingToken) {
//       await passwordResetTokenModel.findByIdAndDelete(existingToken._id);
//     }

//     const newPasswordResetToken = new passwordResetTokenModel({
//       phoneNumber,
//       token,
//       expires,
//     });
//     await newPasswordResetToken.save();

//     const message = `Your password reset token is: ${token}. It is valid for 1 hour.`;
//     // const res =  await client.messages.create({
//     //     body: message,
//     //     from: process.env.FROMPHONENUMBER as string,
//     //     to: phoneNumber,
//     //     });

//     return {
//       success: true,
//       message: "Password reset token sent via SMS",
//     };
//   } catch (error) {
//     console.error("Error sending password reset token via Twilio:", error);
//     return {
//       success: false,
//       message: "Failed to send password reset token via SMS",
//       error,
//     };
//   }
// };

export const generateOtpWithTwilio = async (phoneNumber: string, otp: string) => {
  try {
     const res= await twilioClient.messages.create({
       body: `Your OTP is: ${otp}`,
       from: `whatsapp:+14155238886`,
       to: `whatsapp:${phoneNumber}`,
      });
    return {
      success: true,
      message: "OTP is sent via Whatsapp",
    };
  } catch (error) {
    console.error("Error sending otp  via Twilio:", error);
    return {
      success: false,
      message: "Failed to send otp via Whatsapp",
      error,
    };
  }
};
