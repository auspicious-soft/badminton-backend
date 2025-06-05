import mongoose, { Schema, Document } from "mongoose";

export interface ProductDocument extends Document {
  productName: string;
  image: string;
  hourlyRent: number;
  venueId: mongoose.Types.ObjectId;
  inStock: number;
  isUse: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
    },
    hourlyRent: {
      type: Number,
      default: 0,
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "venues",
      required: true,
    },
    inStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    isUse: {
      type: Number,
      min: 0,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
);

export const inventoryModel = mongoose.model<ProductDocument>(
  "inventory",
  productSchema
);
