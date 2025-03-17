import mongoose, { Schema } from "mongoose";

const storiesSchema = new mongoose.Schema(
  {
    name: {
      type: Object,
      requried: true,
    },
    file: {
      type: Object,
      required: true,
    },
    
  },
  { timestamps: true }
);

export const storiesModel = mongoose.model("stories", storiesSchema);
