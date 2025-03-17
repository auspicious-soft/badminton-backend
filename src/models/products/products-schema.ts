import mongoose, { Mongoose } from "mongoose";

const productsSchema = new mongoose.Schema({
    name: {
      type: Object,
      requried: true,
    },
    description: {
      type: Object,
      requried: true,
    },
    authorId: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "authors",
      required: true,
    },
    categoryId: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "categories",
      required: true,
    },
    subCategoryId: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "subCategories",
      required: true,
    },
    price: {
      type: Number,
      requried: true,
    },
    genre: {
      type: [String],
      requried: true,
    },
    image: {
      type: String,
    },
    file: {
      type: Map,
      of: { type: String },
      default: null,
    },
    type: {
      type: String,
      enum: ["e-book", "podcast", "audiobook", "course"],
      required: true,
    },
    publisherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "publishers",
    },
    isDiscounted: {
      type: Boolean,
      default: false,
    },
    discountPercentage: {
      type: Number,
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
    averageRating: { type: Number, default: 0 },
  },
  { timestamps: true }
);


export const productsModel = mongoose.model("products", productsSchema);