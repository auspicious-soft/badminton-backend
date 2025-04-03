import mongoose, { Schema, Document } from "mongoose";
import { FIXED_FACILITIES, FIXED_GAMES } from "src/lib/constant";


export interface VenueDocument extends Document {
  name: string;
  address: string;
  city: string;
  state: string;
  image?: string;
  gamesAvailable: (typeof FIXED_GAMES)[number][];
  facilities: {
    name: (typeof FIXED_FACILITIES)[number];
    isActive: boolean;
  }[];
  courts: {
    name: string;
    isActive: boolean;
    games: (typeof FIXED_GAMES)[number];
  }[];
  employees: {
    employeeId: mongoose.Types.ObjectId;
    isActive: boolean;
  }[];
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const venueSchema = new Schema<VenueDocument>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },

    image: { type: String, default: null },

    gamesAvailable: [
      {
        type: String,
        enum: FIXED_GAMES,
        required: true,
      },
    ],

    facilities: [
      {
        name: { type: String, enum: FIXED_FACILITIES, required: true },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    courts: [
      {
        name: { type: String, required: true, trim: true },
        isActive: {
          type: Boolean,
          default: true,
        },
        games: {
          type: String,
          enum: FIXED_GAMES,
          required: true,
        },
      },
    ],

    employees: [
      {
        employeeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "employees",
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const venueModel = mongoose.model<VenueDocument>("venues", venueSchema);
