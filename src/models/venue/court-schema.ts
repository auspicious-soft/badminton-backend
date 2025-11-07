import mongoose, { Schema, Document } from "mongoose";
import { FIXED_GAMES } from "src/lib/constant";
import { ByteString } from "webidl-conversions";

export interface CourtDocument extends Document {
  name: string;
  venueId: mongoose.Types.ObjectId;
  games: (typeof FIXED_GAMES)[number];
  isActive: boolean;
  hourlyRate?: number;
  image?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const courtSchema = new Schema<CourtDocument>(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "venues",
      required: true,
      index: true
    },
    games: {
      type: String,
      enum: FIXED_GAMES,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    hourlyRate: {
      type: Number,
      default: 1200
    },
    image: {
      type: String,
      default: null,
    }
  },
  { timestamps: true }
);

// Compound index for efficient queries
courtSchema.index({ venueId: 1, isActive: 1, games: 1 }); // main query pattern
courtSchema.index({ venueId: 1, name: 1 }, { unique: true }); // optional for uniqueness
courtSchema.index({ updatedAt: -1 }); // optional for sorting or recent updates

export const courtModel = mongoose.model<CourtDocument>("courts", courtSchema);