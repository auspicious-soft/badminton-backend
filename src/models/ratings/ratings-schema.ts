import mongoose from "mongoose";

 const ratingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
  comment: { type: String },
});
export const productRatingsModel = mongoose.model("rating", ratingSchema);



