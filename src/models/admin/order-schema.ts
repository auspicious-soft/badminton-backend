import mongoose, { Schema, Document } from "mongoose";

export interface OrderDocument extends Document {
  userId: mongoose.Types.ObjectId;
  items: Array<{
    productId: mongoose.Types.ObjectId;
    quantity: number;
    price: number;
    total: number;
  }>;
  totalAmount: number;
  venueId: mongoose.Types.ObjectId;
  status: "pending" | "ready" | "completed" | "cancelled";
  paymentStatus: "pending" | "completed" | "refunded";
  orderStatus?: "pending" | "ready" | "completed" | "cancelled";
  address?: {
    street: string;
    city: string;
    state: string;
    pinCode: string;
  };
  cancellationReason?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  paymentDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSchema = new Schema<OrderDocument>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        total: {
          type: Number,
          required: true,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "venues",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "ready", "completed", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "refunded"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["pending", "ready", "completed", "cancelled"],
      default: "pending",
    },
    address: {
      street: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      pinCode: {
        type: String,
        required: true,
      },
    },
    cancellationReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for faster queries
orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ venueId: 1, status: 1 });
orderSchema.index({ pickupCode: 1 });

export const orderModel = mongoose.model<OrderDocument>("orders", orderSchema);
