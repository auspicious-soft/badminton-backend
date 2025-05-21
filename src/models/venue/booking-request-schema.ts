import mongoose, { Schema, Document } from "mongoose";

export interface BookingRequestDocument extends Document {
  bookingId: mongoose.Types.ObjectId;
  requestedTo: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  requestedTeam: "team1" | "team2";
  requestedPosition: "player1" | "player2" | "player3" | "player4";
  status: "pending" | "accepted" | "rejected" | "completed";
  racketA: number;
  racketB: number;
  racketC: number;
  balls: number;
  playerPayment: number;
  paymentStatus: "Pending" | "Paid" | "Cancelled" | "Refunded";
  transactionId: mongoose.Types.ObjectId;
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
    requestedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
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
    playerPayment: {
      type: Number,
      default: 0,
    },
    bookingStatus: {
      type: String,
      enum: ["Pending", "Paid", "Cancelled", "Refunded"],
      default: "Pending",
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "transactions",
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
  "bookingRequests",
  bookingRequestSchema
);
