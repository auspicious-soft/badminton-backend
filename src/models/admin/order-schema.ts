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
  pickupCode?: string;
  cancellationReason?: string;
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
    pickupCode: {
      type: String,
      default: () => Math.random().toString(36).substring(2, 8).toUpperCase(),
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
