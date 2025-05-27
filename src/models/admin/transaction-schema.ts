import mongoose, { Schema, Document } from "mongoose";

export interface TransactionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId[];
  paidFor?: mongoose.Types.ObjectId[];
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "failed" | "refunded";
  method?: string;
  notes?: any;
  isWebhookVerified: boolean;
  playcoinsUsed: number;
  playcoinsReserved: boolean;
  playcoinsReceived: number;
  playcoinsDeducted: boolean;

  // Refund related
  refundedAmount?: number;
  refundId?: string;

  // Failure tracking
  failureReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

const transactionSchema = new Schema<TransactionDocument>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    bookingId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "bookings",
      },
    ],
    paidFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    razorpayOrderId: {
      type: String,
      default: null,
      // required: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["created", "authorized", "captured", "failed", "refunded"],
      default: "created",
    },
    method: {
      type: String,
      default: null,
    },
    notes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isWebhookVerified: {
      type: Boolean,
      default: false,
    },
    playcoinsUsed: {
      type: Number,
      default: 0,
    },
    playcoinsReserved: {
      type: Boolean,
      default: false,
    },
    playcoinsReceived: {
      type: Number,
      default: 0,
    },
    playcoinsDeducted: {
      type: Boolean,
      default: false,
    },
    refundedAmount: {
      type: Number,
      default: 0,
    },
    refundId: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const transactionModel = mongoose.model<TransactionDocument>(
  "transactions",
  transactionSchema
);
