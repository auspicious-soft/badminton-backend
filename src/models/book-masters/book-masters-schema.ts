import mongoose, { Schema, model } from "mongoose";

const bookMastersSchema = new Schema(
  {
     productsId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true
        },
       
    
  },
  { timestamps: true }
);

export const bookMastersModel = model("bookMasters", bookMastersSchema);
