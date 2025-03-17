import mongoose, { Schema, model } from "mongoose";

const bookUniversitiesSchema = new Schema(
  {
     productsId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true
        },
       
    
  },
  { timestamps: true }
);

export const bookUniversitiesModel = model("bookUniversities", bookUniversitiesSchema);
