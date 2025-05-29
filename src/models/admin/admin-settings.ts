import mongoose from "mongoose";
import { freemem } from "os";

const admintSettingSchema = new mongoose.Schema(
  {
    privacyPolicy: {
      type: String,
      default: null,
    },
    termsAndConditions: {
      type: String,
      default: null,
    },
    aboutUs: {
      type: String,
      default: null,
    },
    contactUs: {
      type: String,
      default: null,
    },
    faq: {
      type: String,
      default: null,
    },
    cancellationPolicy: {
      type: String,
      default: null,
    },
    refundPolicy: {
      type: String,
      default: null,
    },
    userAgreement: {
      type: String,
      default: null,
    },
    referral: {
      enabled: {
        type: Boolean,
        default: true,
      },
      bonusAmount: {
        type: Number,
        default: 50,
      },
      bonusType: {
        type: String,
        enum: ["playCoins"],
        default: "playCoins",
      },
    },
    loyaltyPoints: {
      enabled: {
        type: Boolean,
        default: true,
      },
      limit: {
        type: Number,
        default: 2000,
      },
      perMatch: {
        type: Number,
        default: 200,
      },
      rewardType: {
        type: String,
        enum: ["freeGame", "playCoins"],
        default: "freeGame",
      },
      playCointAmount: {
        type: Number,
        default: 50,
      },
      freeGameAmount: {
        type: Number,
        default: 1,
      },
    },
    banners: [
      {
        type: String,
        default: null,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const adminSettingModel = mongoose.model(
  "adminSettings",
  admintSettingSchema
);
