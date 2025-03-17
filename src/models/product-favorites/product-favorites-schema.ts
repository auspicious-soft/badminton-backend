import mongoose, { Schema } from "mongoose";

const favoritesSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'products',
      required: true
    }
  },
  { timestamps: true }
);

export const favoritesModel = mongoose.model("favorites", favoritesSchema);
