import mongoose from "mongoose";

const bookLivesSchema = new mongoose.Schema({
  
    name: {
      type: Object,
      requried: true,
    },
    image: {
      type: String,
      requried: true,
    },
  },
  { timestamps: true }
);

export const bookLivesModel = mongoose.model("bookLives", bookLivesSchema);
