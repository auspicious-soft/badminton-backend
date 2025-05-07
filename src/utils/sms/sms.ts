// import twilio
import twilio from "twilio";
import { configDotenv } from "dotenv";
configDotenv();
const client = twilio(process.env.TWILIO_ACCOUNT_SID as string, process.env.TWILIO_AUTH_TOKEN as string);
// const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

export const generateTwilioVerificationOTP = async (phoneNumber: string ,token: string, expiresAt: Date) => {

  try {
    // Update message to reflect 2-minute expiry
    const message = `You verification code from Play App is: ${token}. It is valid for 2 minutes.`;
    const res =  await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER as string,
        to: `+91${phoneNumber}`,
        });

    return {
      success: true,
      message: "Password reset token sent via SMS",
    };
  } catch (error) {
    console.error("Error sending password reset token via Twilio:", error);
    return {
      success: false,
      message: "Failed to send password reset token via SMS",
      error,
    };
  }
};

// export const generateOtpWithTwilio = async (phoneNumber: string, otp: string) => {
//   try {
//      const res= await twilioClient.messages.create({
//        body: `Your OTP is: ${otp}`,
//        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
//        to: `whatsapp:${phoneNumber}`,
//       });
//     return {
//       success: true,
//       message: "OTP is sent via Whatsapp",
//     };
//   } catch (error) {
//     console.error("Error sending otp  via Twilio:", error);
//     return {
//       success: false,
//       message: "Failed to send otp via Whatsapp",
//       error,
//     };
//   }
// };
