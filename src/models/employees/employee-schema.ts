import mongoose, { Schema } from "mongoose";

export interface EmployeeDocument extends Document {
  _id?: string;
  identifier?: string;
  role?: string;
  fullName?: string;
  email: string;
  password: string;
  authType?: string;
  countryCode?: string;
  phoneNumber?: string | null;
  status?: string;
  profilePic?: string | null;
  emailVerified: boolean;
  otp?: {
    code?: string | null;
    expiresAt?: Date | null;
  };
  token?: string;
  fcmToken?: string | null;
  dob?: Date;
  country?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const employeeSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      // required: true,
      unique: true,
    },
    role: {
      type: String,
      required: true,
      default: "employee",
    },
    fullName: {
      type: String,
      requried: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    authType: {
      type: String,
      default: "Email",
    },
    countryCode: {
      type: String,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["Working", "Ex-Employee"],
      default: "Working",
    },
    profilePic: {
      type: String,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: true,
    },
    otp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
    token: {
      type: String,
    },
    fcmToken: {
      type: String,
      default: null,
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

export const employeesModel = mongoose.model("employees", employeeSchema);
