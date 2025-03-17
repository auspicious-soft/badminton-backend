import mongoose from "mongoose";

const courseLessonsSchema = new mongoose.Schema({
    lang: {
      type: String,
      requried: true,
    },
    name: {
      type: String,
      requried: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    srNo: {
      type: Number,
      required: true,
    },
    subLessons:[{
      name:{type:String},
      description:{type:String},
      srNo:{type:Number},
      file:{type:String},
      additionalFiles:{type:[Object]},
      links:{type:[Object]}
    }],
  
  },
  { timestamps: true }
);


export const courseLessonsModel = mongoose.model("courseLessons", courseLessonsSchema);