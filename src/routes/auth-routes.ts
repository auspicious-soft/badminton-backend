import { Router } from "express";
import { forgotPassword, login, newPassswordAfterOTPVerified } from "src/controllers/admin/admin-controller";
import { forgotPasswordUser, loginUser, newPassswordAfterOTPVerifiedUser, resendOTP, userSignup, verifyOTP, verifyOtpPasswordReset } from "src/controllers/user/user-controller";

const router = Router();

//adminAuth routes
router.post("/login", login)
router.post("/verify-otp-reset-pass", verifyOtpPasswordReset)
router.post("/forgot-password", forgotPassword)
router.patch("/new-password-otp-verified", newPassswordAfterOTPVerified)

//userAuth routes
router.post("/user-login", loginUser)
router.post("/resend-otp", resendOTP)
router.post("/user-signup", userSignup)
router.post("/verify-otp", verifyOTP)
router.post("/user-forgot-password", forgotPasswordUser)
router.patch("/user-new-password-otp-verified", newPassswordAfterOTPVerifiedUser)

export { router };