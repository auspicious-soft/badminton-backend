import mongoose, { Schema } from "mongoose";

const collectionsSchema = new mongoose.Schema(
  {
    name: {
      type: Object,
      requried: true,
    },
    image: {
      type: String,
      requried: true,
    },
    booksId: {
      type: [Schema.Types.ObjectId],
      ref: 'products'
    },
    displayOnMobile: {
      type: Boolean,
      default: false, 
    },
  },
  { timestamps: true }
);

export const collectionsModel = mongoose.model("collections", collectionsSchema);
