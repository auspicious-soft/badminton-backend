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
import { sendEmailVerificationMail } from "src/utils/mails/mail";
import { generatePasswordResetTokenByPhoneWithTwilio } from "src/utils/sms/sms";

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
//   // sendEmailVerificationMail("ya@yopmail.com", "777777", "eng");

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
router.get("/test", async (req, res) => {
  // sendEmailVerificationMail("ya@yopmail.com", "777777", "eng");
      await generatePasswordResetTokenByPhoneWithTwilio(
      "9816996929",
      "585858",
      new Date(Date.now() + 10 * 60 * 1000),
    );

  // const response = await fetch(`https://2factor.in/API/V1/f40eb2dd-2a4e-11f0-8b17-0200cd936042/SMS/9882211037/AUTOGEN`, {
  //   method: 'GET'
  // });

  // const data = await response.json();
  // console.log("data: ", data);
  res.status(200).json({
    success: true,
    message: "Email sent successfully",
    // data: data,
  });
});

export { router };
