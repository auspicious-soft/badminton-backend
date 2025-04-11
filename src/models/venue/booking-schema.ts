import mongoose, { Schema, Document } from "mongoose";
import { VENUE_TIME_SLOTS } from "src/lib/constant";

export interface BookingDocument extends Document {
  userId: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  courtId: mongoose.Types.ObjectId;
  gameType: "Public" | "Private";
  askToJoin: boolean;
  isCompetitive: boolean;
  skillRequired: number;
  team1: any;
  team2: any;
  bookingType: "Self" | "Booking" | "Complete";
  bookingAmount: number;
  bookingPaymentStatus: boolean;
  bookingDate: Date;
  bookingSlots: string;
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
    team1: [
      {
        playerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
        },
        playerType: {
          type: String,
          enum: ["player1", "player2"],
          required: true,
        },
        playerPayment: {
          type: Number,
          default: 0,
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Cancelled", "Refunded"],
          default: "Pending",
        },
        paidBy: {
          type: String,
          enum: ["player1", "player2", "player3", "player4", "Self"],
          default: "Self",
        },
        racketA: {
          type: Number,
          default: 0,
        },
        racketB: {
          type: Number,
          default: 0,
        },
        racketC: {
          type: Number,
          default: 0,
        },
        balls: {
          type: Number,
          default: 0,
        },
      },
    ],
    team2: [
      {
        playerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          defult: null,
        },
        playerType: {
          type: String,
          enum: ["player3", "player4"],
          required: true,
        },
        playerPayment: {
          type: Number,
          defult: 0,
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Cancelled", "Refunded"],
          default: "Pending",
        },
        paidBy: {
          type: String,
          enum: ["player1", "player2", "player3", "player4", "Self"],
          default: "Self",
        },
        racketA: {
          type: Number,
          default: 0,
        },
        racketB: {
          type: Number,
          default: 0,
        },
        racketC: {
          type: Number,
          default: 0,
        },
        balls: {
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
    bookingType: {
      type: String,
      enum: ["Self", "Booking", "Complete"],
      default: "Self",
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
    bookingSlots: { type: String, enum: VENUE_TIME_SLOTS, required: true },
    cancellationReason: { type: String, default: null },
  },
  { timestamps: true }
);

export const bookingModel = mongoose.model<BookingDocument>(
  "bookings",
  bookingSchema
);
