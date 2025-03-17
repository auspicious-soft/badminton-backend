import mongoose from "mongoose";

const readProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    progress: {
      type: Number,
      default: 0,
    },
    // readSections: [{
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "courseLessons.sections",
    //   required: false, 
    // }],
    readSections: [
      {
        courseLessonId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "courseLessons", // Reference the courseLesson model
          required: true,
        },
        sectionId: {
          type: mongoose.Schema.Types.ObjectId, // Store the section’s _id
          required: true,
        },
      },
    ],
    certificate: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const readProgressModel = mongoose.model("readProgress", readProgressSchema);
