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
  paymentStatus: "pending" | "paid" | "refunded";
  orderStatus?: "pending" | "confirmed" | "ready" | "delivered" | "cancelled";
  address?: {
    nameOfRecipient?: string;
    phoneNumber?: string;
    street: string;
    city: string;
    state: string;
    pinCode: string;
    country?: string;
  };
  cancellationReason?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  paymentDate?: Date;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  quantityUpdated?: boolean;
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
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["pending", "confirmed", "ready", "delivered", "cancelled"],
      default: "pending",
    },
    address: {
      nameOfRecipient: {
        type: String,
        default: null,
      },
      phoneNumber: {
        type: String,
        default: null,
      },
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
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpayOrderId: {
      type: String,
      default: null,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    quantityUpdated: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      default: "active",
    },
  },
  { timestamps: true }
);

// Index for faster queries
orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ venueId: 1, status: 1 });
orderSchema.index({ pickupCode: 1 });

export const orderModel = mongoose.model<OrderDocument>("orders", orderSchema);
