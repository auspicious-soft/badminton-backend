import { Router } from "express";
import {
  forgotPassword,
  login,
  newPassswordAfterOTPVerified,
} from "src/controllers/admin/admin-controller";
import {
  forgotPasswordUser,
  loginUser,
  newPassswordAfterOTPVerifiedUser,
  resendOTP,
  socialLogin,
  userSignup,
  verifyOTP,
  verifyOtpPasswordForget,
  verifyOtpPasswordReset,
} from "src/controllers/user/user-controller";
import { checkOTPAuth } from "src/middleware/check-auth";
import { usersModel } from "src/models/user/user-schema";
import { sendNotification } from "src/utils/FCM/FCM";
import { sendEmailVerificationMail } from "src/utils/mails/mail";
import { generateTwilioVerificationOTP } from "src/utils/sms/sms";

const router = Router();

//adminAuth routes
router.post("/login", login);
router.post("/verify-otp-reset-pass", verifyOtpPasswordReset);
router.post("/forgot-password", forgotPassword);
router.patch("/new-password-otp-verified", newPassswordAfterOTPVerified);

//userAuth routes
router.post("/social-login", socialLogin)
router.post("/user-signup", userSignup);
router.post("/verify-otp", checkOTPAuth, verifyOTP);
router.post("/user-login", loginUser);
router.post("/resend-otp", resendOTP);
router.post("/user-forgot-password", forgotPasswordUser);
router.post(
  "/verify-otp-forget-password",
  checkOTPAuth,
  verifyOtpPasswordForget
);
router.patch(
  "/user-new-password-otp-verified",
  checkOTPAuth,
  newPassswordAfterOTPVerifiedUser
);

// router.get("/test", async (req, res) => {
//   // sendEmailVerficationMail("ya@yopmail.com", "777777", "eng")
//   const response = await fetch(`https://2factor.in/API/V1/f40eb2dd-2a4e-11f0-8b17-0200cd936042/SMS/9882211037/AUTOGEN`, {
//     method: 'GET'
//   });

//   const data = await response.json();
//   console.log("data: ", data);
//   res.status(200).json({
//     success: true,
//     message: "Email sent successfully",
//     data: data,
//   });
// });

// router.get("/test", async (req, res) => {
//   // sendEmailVerificationMail("ya@yopmail.com", "777777", "eng");
//       await generateTwilioVerificationOTP(
//       "9816996929",
//       "585858",
//       new Date(Date.now() + 10 * 60 * 1000),
//     );

//   // const response = await fetch(`https://2factor.in/API/V1/f40eb2dd-2a4e-11f0-8b17-0200cd936042/SMS/9882211037/AUTOGEN`, {
//   //   method: 'GET'
//   // });

//   // const data = await response.json();
//   // console.log("data: ", data);
//   res.status(200).json({
//     success: true,
//     message: "Email sent successfully",
//     // data: data,
//   });
// });

router.post('/test-notifications', async (req, res) => {
  // Simulate sending a notification
  const {id} = req.body;

  const user = await usersModel.findById(id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  for(const fcmToken of user?.fcmToken || []) {
    console.log(`Sending notification to ${fcmToken}`);
    // Here you would call your FCM send function
    await sendNotification(fcmToken, "Test Notification", "This is a test notification");
  }
  console.log("Sending test notification...");
  res.status(200).json({
    success: true,
    message: "Test notification sent successfully",
  });
});

export { router };
