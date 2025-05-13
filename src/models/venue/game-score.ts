import mongoose, { Schema, Document } from "mongoose";

export interface ScoreDocument extends Document {
  bookingId: mongoose.Types.ObjectId;
  set1: any;
  set2: any;
  set3: any;
  winner: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const scoreSchema = new Schema<ScoreDocument>(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookings",
      required: true,
      index: true,
    },
    set1: {
      type: Object,
      default: {
        team1: 0,
        team2: 0,
      },
    },
    set2: {
      type: Object,
      default: {
        team1: 0,
        team2: 0,
      },
    },
    set3: {
      type: Object,
      default: {
        team1: 0,
        team2: 0,
      },
    },
    winner: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

export const gameScoreModel = mongoose.model<ScoreDocument>("gameScore", scoreSchema);
