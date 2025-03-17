import mongoose, { Schema } from "mongoose";

const awardsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    badge: {
      type: String,
      enum: ["Saint", "Hakim", "Genius", "Teacher", "Sufi", "Expert", "Commentator", "Dervish", "Murid"],
    },
    level: {
      type: Number,
      requried: true,
      enum: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
    achievedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const awardsModel = mongoose.model("awards", awardsSchema);
