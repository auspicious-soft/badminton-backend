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
  bookingType: "Booking" | "Complete" | "Cancelled";
  bookingAmount: number;
  bookingPaymentStatus: boolean;
  bookingDate: Date;
  bookingSlots: string;
  expectedPayment: number;
  cancellationReason?: string;
  isMaintenance?: boolean;
  maintenanceReason?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const bookingSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true, // 🔍 Index on userId
    },
    gameType: {
      type: String,
      enum: ["Public", "Private"],
      default: "Private",
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
          index: true, // 🔍 Index nested
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
          index: true,
        },
        transactionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "transactions",
        },
        paidBy: {
          type: String,
          enum: ["User", "Self"],
          default: "Self",
        },
        rackets: {
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
          default: null,
          index: true, // 🔍 Index nested
        },
        playerType: {
          type: String,
          enum: ["player3", "player4"],
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
          index: true,
        },
        transactionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "transactions",
        },
        paidBy: {
          type: String,
          enum: ["Self", "User"],
          default: "Self",
        },
        rackets: {
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
      index: true,
    },
    courtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "courts",
      required: true,
      index: true,
    },
    bookingType: {
      type: String,
      enum: ["Booking", "Complete", "Cancelled"],
      default: "Booking",
      required: true,
      index: true,
    },
    bookingAmount: {
      type: Number,
      default: 0,
    },
    bookingPaymentStatus: {
      type: Boolean,
      default: false,
    },
    bookingDate: {
      type: Date,
      required: true,
      index: true,
    },
    bookingSlots: {
      type: String,
      enum: VENUE_TIME_SLOTS,
      required: true,
    },
    expectedPayment: {
      type: Number,
      default: 0,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    isMaintenance: {
      type: Boolean,
      default: false,
    },
    maintenanceReason: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "employees",
    },
  },
  { timestamps: true }
);

// 🔁 Compound Indexes for optimized filtering
bookingSchema.index({ "team1.playerId": 1, "team1.paymentStatus": 1 });
bookingSchema.index({ "team2.playerId": 1, "team2.paymentStatus": 1 });
bookingSchema.index({ userId: 1, bookingDate: 1 });

export const bookingModel = mongoose.model<BookingDocument>(
  "bookings",
  bookingSchema
);
