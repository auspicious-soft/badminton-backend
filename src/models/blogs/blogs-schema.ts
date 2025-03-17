import mongoose, { Mongoose } from "mongoose";

const blogsSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookLives",
      requried: true,
    },
    image: {
      type: String,
      requried: true,
    },
    name: {
      type: String,
      requried: true,
    },
    description: {
      type: String,
      requried: true,
    },
  },
  { timestamps: true }
);

export const blogsModel = mongoose.model("blogs", blogsSchema);
