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
  userSignup,
  verifyOTP,
  verifyOtpPasswordForget,
  verifyOtpPasswordReset,
} from "src/controllers/user/user-controller";
import { checkOTPAuth } from "src/middleware/check-auth";
import { sendEmailVerificationMail } from "src/utils/mails/mail";

const router = Router();

//adminAuth routes
router.post("/login", login);
router.post("/verify-otp-reset-pass", verifyOtpPasswordReset);
router.post("/forgot-password", forgotPassword);
router.patch("/new-password-otp-verified", newPassswordAfterOTPVerified);

//userAuth routes
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

router.post("/test", (req, res) => {
  sendEmailVerificationMail("ya@yopmail.com", "777777", "eng");
  res.status(200).json({
    success: true,
    message: "Email sent successfully",
  });
});

export { router };
