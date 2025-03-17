import mongoose, { Schema } from "mongoose";

const summariesSchema = new mongoose.Schema(
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
    }
  },
  { timestamps: true }
);

export const summariesModel = mongoose.model("summaries", summariesSchema);
