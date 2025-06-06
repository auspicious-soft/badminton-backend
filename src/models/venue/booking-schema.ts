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
  expectedPayment: number; // New field for total expected payment
  cancellationReason?: string;
  isMaintenance?: boolean; // Field to indicate maintenance booking
  maintenanceReason?: string; // Reason for maintenance
  createdBy?: mongoose.Types.ObjectId; // Admin/employee who created the maintenance
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
    },
    courtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "courts",
      required: true,
    },
    bookingType: {
      type: String,
      enum: ["Booking", "Complete", "Cancelled"],
      default: "Booking",
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
    expectedPayment: {
      type: Number,
      default: 0,
    },
    cancellationReason: { type: String, default: null },
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

export const bookingModel = mongoose.model<BookingDocument>(
  "bookings",
  bookingSchema
);
