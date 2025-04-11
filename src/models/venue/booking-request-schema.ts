import mongoose, { Schema, Document } from "mongoose";

export interface BookingRequestDocument extends Document {
  bookingId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  requestedTeam: "team1" | "team2";
  requestedPosition: "player1" | "player2" | "player3" | "player4";
  status: "pending" | "accepted" | "rejected" | "completed";
  rentedRacket: number;
  rentedBalls: number;
  playerPayment: number;
  paymentStatus: "Pending" | "Paid" | "Cancelled" | "Refunded";
  createdAt?: Date;
  updatedAt?: Date;
}

const bookingRequestSchema = new Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookings",
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    requestedTeam: {
      type: String,
      enum: ["team1", "team2"],
      required: true,
    },
    requestedPosition: {
      type: String,
      enum: ["player1", "player2", "player3", "player4"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "completed"],
      default: "pending",
    },
    rentedRacket: {
      type: Number,
      default: 0,
    },
    rentedBalls: {
      type: Number,
      default: 0,
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
  },
  { timestamps: true }
);

// Create compound index to prevent duplicate requests
bookingRequestSchema.index(
  { bookingId: 1, requestedBy: 1, requestedPosition: 1 },
  { unique: true }
);

export const bookingRequestModel = mongoose.model<BookingRequestDocument>(
  "booking_requests",
  bookingRequestSchema
);