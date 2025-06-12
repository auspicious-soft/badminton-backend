import mongoose, { Schema, Document } from "mongoose";
import { array } from "zod";

// export interface ScoreDocument extends Document {
//   bookingId: mongoose.Types.ObjectId;
//   gameType: "Padel" | "Pickleball";
//   gameWeight: number; // Weight of the game, default is 1
//   set1: any;
//   set2: any;
//   set3: any;
//   winner: string;
//   createdAt?: Date;
//   updatedAt?: Date;
// }

const scoreSchema = new Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookings",
      required: true,
      index: true,
    },
    gameType: {
      type: String,
      enum: ["Padel", "Pickleball"],
      required: true,
    },
    matchType:{
      type: String,
      enum: ["Competitive", "Friendly"],
      required: true,
      default: "Friendly", // Default match type is Doubles
    },
    weight: {
      type: Number,
      required: true,
      default: 1, // Default weight for the game
    },
    player_A1:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    player_A2:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    player_B1:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    player_B2:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
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

export const gameScoreModel = mongoose.model(
  "gameScore",
  scoreSchema
);
