import mongoose, { Schema } from "mongoose";

export interface UserDocument extends Document {
  _id?: string;
  email?: string;
  password?: string;
  fullName?: string;
  phoneNumber?: string;
  otp?: {
    code: string;
    expiresAt: Date;
  };
  emailVerified: boolean;
  role?: string;
  countryCode?: string;
  level?: string;
  profilePic?: string;
  authType?: string;
  schoolVoucher?: string;
}
const usersSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      // required: true,
      unique: true,
    },
    role: {
      type: String,
      required: true,
      default: "user",
    },
    fullName: {
      type: Object,
      // requried: true,
      trim: true,
    },
    firstName: {
      type: Object,
      // requried: true,
      trim: true,
    },
    lastName: {
      type: Object,
      // requried: true,
      trim: true,
    },
    email: {
      type: String,
      // required: true,
      // unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      // required: function(this: UserDocument) {
      //   return !this.googleId && !this.facebookId && !this.appleId && !this.phoneNumber;
      // },
    },
    authType: {
      type: String,
      enum: ["Email", "Whatsapp", "Facebook", "Apple", "Google"],
      default: "Email",
    },
    countryCode: {
      type: String,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    profilePic: {
      type: String,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    whatsappNumberVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
    language: {
      type: String,
      enum: ["kaz", "eng", "rus"],
      default: "eng",
    },
    token: {
      type: String,
    },
    schoolVoucher: {
      voucherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "bookSchools",
      },
      createdAt: { type: Date, default: Date.now },
      expiredAt: { type: Date, default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    },
    fcmToken: {
      type: String,
      default: null,
    },
    productsLanguage: {
      type: [String],
      enum: ["kaz", "eng", "rus"],
      default: "eng",
    },
    dob: {
      type: Date,
    },
    country: {
      type: String,
    },
  },
  { timestamps: true }
);

export const usersModel = mongoose.model("users", usersSchema);
