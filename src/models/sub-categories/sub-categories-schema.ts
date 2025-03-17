import mongoose, { Mongoose } from "mongoose";

const subCategoriesSchema = new mongoose.Schema(
  {
    name: {
      type: Object,
      requried: true,
    },
    image: {
      type: String,
    //   requried: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "categories",
      // requried: true,
    },
  },
  { timestamps: true }
);

export const subCategoriesModel = mongoose.model("subCategories", subCategoriesSchema);
