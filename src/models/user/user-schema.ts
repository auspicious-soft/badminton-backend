import mongoose, { Schema, Document } from "mongoose";

export interface UserDocument{
  _id?: string;
  email?: string | null;
  password?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  countryCode?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  otp?: {
    emailCode: string;
    phoneCode: string;
    expiresAt: Date;
  };
  authType?: string;
  role?: string;
  profilePic?: string;
  language?: string;
  token?: string;
  fcmToken?: string;
  productsLanguage?: string[];
  dob?: Date;
  country?: string;
  createdAt?: Date;
  updatedAt?: Date;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
}

const usersSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      default: "user",
    },
    fullName: {
      type: String,
      trim: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      default: null,
    },
    password: {
      type: String,
    },
    authType: {
      type: String,
      enum: ["Email", "Phone", "Email-Phone", "Facebook", "Apple", "Google"],
      default: "Phone",
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
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      emailCode: { type: String, default: null },
      phoneCode: { type: String, default: null },
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
    fcmToken: {
      type: String,
      default: null,
    },
    productsLanguage: {
      type: [String],
      enum: ["kaz", "eng", "rus"],
      default: ["eng"],
    },
    dob: {
      type: Date,
    },
    country: {
      type: String,
      default: "India"
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  { timestamps: true }
);

export const usersModel = mongoose.model<UserDocument>("users", usersSchema);
