import mongoose from "mongoose";

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
    banners: [
      {
        type: String,
        default: null,
      },
    ],
  },
  { timestamps: true }
);

export const adminSettingModel = mongoose.model(
  "adminSettings",
  admintSettingSchema
);
