import mongoose, { Schema, model } from "mongoose";

const bookStudiesSchema = new Schema(
  {
    productsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true
    },
   
    
  },
  { timestamps: true }
);

export const bookStudiesModel = model("bookStudies", bookStudiesSchema);
