import mongoose, { Schema } from "mongoose";

const authorfavoritesSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'authors',
      required: true
    }
  },
  { timestamps: true }
);

export const authorFavoritesModel = mongoose.model("authorFavorites", authorfavoritesSchema);
