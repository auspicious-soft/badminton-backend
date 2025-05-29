import mongoose, { Schema, Document } from "mongoose";

export interface ReferralInfo {
  code: string;
  expiryDate: Date;
  usageCount: number;
  maxUsage: number;
  isActive: boolean;
}

export interface NotificationPreferences {
  gameInvites: boolean;
  friendRequests: boolean;
  bookingReminders: boolean;
  promotions: boolean;
  systemUpdates: boolean;
  nearbyEvents: boolean;
}

export interface AdditionalUserInfoDocument extends Document {
  userId: mongoose.Types.ObjectId;
  playCoins: number;
  referrals: ReferralInfo[];
  loyaltyPoints: number;
  loyaltyTier: string;
  notificationPreferences: NotificationPreferences;
  clubMember: boolean;
  freeGameCount: number;
  playerRating: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const additionalUserInfoSchema = new Schema<AdditionalUserInfoDocument>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      unique: true,
      index: true,
    },
    playCoins: {
      type: Number,
      default: 0,
      min: 0,
    },
    referrals: [
      {
        code: {
          type: String,
          required: true,
        },
        expiryDate: {
          type: Date,
          required: true,
        },
        usageCount: {
          type: Number,
          default: 0,
        },
        maxUsage: {
          type: Number,
          default: 10,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    loyaltyPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    loyaltyTier: {
      type: String,
      enum: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
      default: "Bronze",
    },
    notificationPreferences: {
      gameInvites: {
        type: Boolean,
        default: true,
      },
      friendRequests: {
        type: Boolean,
        default: true,
      },
      bookingReminders: {
        type: Boolean,
        default: true,
      },
      promotions: {
        type: Boolean,
        default: true,
      },
      systemUpdates: {
        type: Boolean,
        default: true,
      },
      nearbyEvents: {
        type: Boolean,
        default: true,
      },
    },
    freeGameCount:{
      type: Number,
      default: 0,
      min: 0,
    },
    clubMember: {
      type: Boolean,
      default: false,
    },
    playerRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
  },
  { timestamps: true }
);

// Create index for faster lookups
additionalUserInfoSchema.index({ userId: 1 });
additionalUserInfoSchema.index({ "referrals.code": 1 });

export const additionalUserInfoModel = mongoose.model<AdditionalUserInfoDocument>(
  "additionalUserInfo",
  additionalUserInfoSchema)