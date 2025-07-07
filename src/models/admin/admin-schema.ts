import mongoose from "mongoose";
export interface IUser {
    identifier: string;
    email: string;
    password?: string;
    name: string;
    phoneNumber?: string;
    role: string;
    fullName: string;
    profilePic?: string;
    address?: string;
}

export interface AuthResponse {
    token: string;
    user: IUser;
}
const adminSchema = new mongoose.Schema({
  
    identifier: {
      type: String,
      // required: true,
      unique: true,
    },
    role: {
      type: String,
      requried: true,
    },
    fullName: {
      type: String,
      requried: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    phoneNumber: {
      type: String,
    },
    profilePic: {
      type: String,
      default:null
    },

    address: { type: String },
  },
  { timestamps: true }
);

export const adminModel = mongoose.model("admin", adminSchema);
