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
import { Parser } from "json2csv";
import { checkOTPAuth } from "src/middleware/check-auth";
import { gameScoreModel } from "src/models/venue/game-score";


const router = Router();

//adminAuth routes
router.post("/login", login);
router.post("/verify-otp-reset-pass", verifyOtpPasswordReset);
router.post("/forgot-password", forgotPassword);
router.patch("/new-password-otp-verified", newPassswordAfterOTPVerified);

//userAuth routes
router.post("/social-login", socialLogin);
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

router.get("/test-route", async (req, res) => {
  try {
    const days: any = req.query.days || 3;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const score = await gameScoreModel
      .find({
        updatedAt: { $gte: startDate, $lt: endDate },
        gameType: "Padel",
      })
      .populate("bookingId player_A1 player_A2 player_B1 player_B2")
      .lean();

    const data: any = [];

    score?.forEach((item: any) => {
      const format = {
        FixtureID: item?.bookingId?._id || item._id,
        Date: item?.bookingId?.bookingDate?.toISOString()?.split("T")[0],
        Player_A1: item?.player_A1?.fullName?.toUpperCase() || "N/A",
        ID_A1: item?.player_A1?._id || 0,
        Lat_A1: item?.player_A1?.location?.coordinates[1] || 0,
        Lng_A1: item?.player_A1?.location?.coordinates[0] || 0,
        Privacy_A1: false,
        Country_A1: "IND",
        PlayerCountry_A1: "IND",
        Player_A2: item?.player_A2?.fullName?.toUpperCase() || "N/A",
        ID_A2: item?.player_A2?._id || 0,
        Lat_A2: item?.player_A2?.location?.coordinates[1] || 0,
        Lng_A2: item?.player_A2?.location?.coordinates[0] || 0,
        Privacy_A2: false,
        Country_A2: "IND",
        PlayerCountry_A2: "IND",
        Player_B1: item?.player_B1?.fullName?.toUpperCase() || "N/A",
        ID_B1: item?.player_B1?._id || 0,
        Lat_B1: item?.player_B1?.location?.coordinates[1] || 0,
        Lng_B1: item?.player_B1?.location?.coordinates[0] || 0,
        Privacy_B1: false,
        Country_B1: "IND",
        PlayerCountry_B1: "IND",
        Player_B2: item?.player_B2?.fullName?.toUpperCase() || "N/A",
        ID_B2: item?.player_B2?._id || 0,
        Lat_B2: item?.player_B2?.location?.coordinates[1] || 0,
        Lng_B2: item?.player_B2?.location?.coordinates[0] || 0,
        Privacy_B2: false,
        Country_B2: "IND",
        PlayerCountry_B2: "IND",
        Result: `${item?.set1?.team1 || 0}-${item?.set1?.team2 || 0}, ${item?.set2?.team1 || 0}-${
          item?.set2?.team2 || 0
        }, ${item?.set3?.team1 || 0}-${item?.set3?.team2 || 0}`,
        MatchType: item.matchType || "Friendly",
        Sport: "padel",
        Weight: item?.weight || 1,
      };
      data.push(format);
    });

    // Step 2: Define CSV columns (headers)
    const fields = [
      "FixtureID",
      "Date",
      "Player_A1",
      "ID_A1",
      "Privacy_A1",
      "Country_A1",
      "PlayerCountry_A1",
      "Lat_A1",
      "Lng_A1",

      "Player_A2",
      "ID_A2",
      "Privacy_A2",
      "Country_A2",
      "PlayerCountry_A2",
      "Lat_A2",
      "Lng_A2",

      "Player_B1",
      "ID_B1",
      "Privacy_B1",
      "Country_B1",
      "PlayerCountry_B1",
      "Lat_B1",
      "Lng_B1",

      "Player_B2",
      "ID_B2",
      "Privacy_B2",
      "Country_B2",
      "PlayerCountry_B2",
      "Lat_B2",
      "Lng_B2",

      "Result",
      "MatchType",
      "Weight",
    ];
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(data);
    res.header("Content-Type", "text/csv");
    res.attachment("users.csv");
    res.send(csv);
  } catch (error) {
    console.error("CSV generation error:", error);
    res.status(500).json({ error: "Failed to generate CSV" });
  }
});

export { router };
