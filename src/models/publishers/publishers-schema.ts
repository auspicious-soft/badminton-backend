import mongoose, { Schema } from "mongoose";

const publishersSchema = new mongoose.Schema(
  {
    name: {
      type: Object,
      requried: true,
    },
    role:{
      type: String,
      requried: true,
      default: "publisher"
    },
    categoryId: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "categories",
      requried: true,
    },
    email: {
      type: String,
    },
    password: {
      type: String,
    },
    description: {
      type: Object,
    },
    country: {
      type: String,
    },
    image: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const publishersModel = mongoose.model("publishers", publishersSchema);
