import mongoose, { Schema, Document } from "mongoose";
import { VENUE_TIME_SLOTS } from "src/lib/constant";

export interface TeamPlayer {
  player1?: mongoose.Types.ObjectId;
  player2?: mongoose.Types.ObjectId;
  rentedRacket?: number;
  rentedBalls?: number;
  paymentStatus: "Pending" | "Paid" | "Cancelled" | "Refunded";
}

export interface BookingDocument extends Document {
  userId: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  courtId: mongoose.Types.ObjectId;
  gameType: "Public" | "Private";
  askToJoin: boolean;
  isCompetitive: boolean;
  skillRequired: number;
  teams1: TeamPlayer[];
  team2: TeamPlayer[];
  bookingAmount: number;
  bookingPaymentStatus: boolean;
  bookingDate: Date;
  bookingSlots: string[];
  cancellationReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const bookingSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    gameType: {
      type: String,
      enum: ["Public", "Private"],
      default: "Public",
      required: true,
    },
    askToJoin: {
      type: Boolean,
      default: false,
    },
    isCompetitive: {
      type: Boolean,
      default: false,
    },
    skillRequired: {
      type: Number,
      default: 0,
    },
    teams1: [
      {
        player1: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          defult: null,
          required: true,
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Cancelled", "Refunded"],
          default: "Pending",
        },
        rentedRacket: {
          type: Number,
          default: 0,
        },
        rentedBalls: {
          type: Number,
          default: 0,
        },
      },
      {
        player2: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          defult: null,
          required: true,
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Cancelled", "Refunded"],
          default: "Pending",
        },
        rentedRacket: {
          type: Number,
          default: 0,
        },
        rentedBalls: {
          type: Number,
          default: 0,
        },
      },
    ],
    team2: [
      {
        player1: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          defult: null,
          required: true,
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Cancelled", "Refunded"],
          default: "Pending",
        },
        rentedRacket: {
          type: Number,
          default: 0,
        },
        rentedBalls: {
          type: Number,
          default: 0,
        },
      },
      {
        player2: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          defult: null,
          required: true,
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Cancelled", "Refunded"],
          default: "Pending",
        },
        rentedRacket: {
          type: Number,
          default: 0,
        },
        rentedBalls: {
          type: Number,
          default: 0,
        },
      },
    ],
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "venues",
      required: true,
    },
    courtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "courts",
      required: true,
    },
    bookingAmount: {
      type: Number,
      default: 0,
    },
    bookingPaymentStatus: {
      type: Boolean,
      default: false,
    },
    bookingDate: { type: Date, required: true },
    bookingSlots: { type: [String], enum: VENUE_TIME_SLOTS, required: true },
    cancellationReason: { type: String, default: null },
  },
  { timestamps: true }
);

export const bookingModel = mongoose.model<BookingDocument>(
  "bookings",
  bookingSchema
);
