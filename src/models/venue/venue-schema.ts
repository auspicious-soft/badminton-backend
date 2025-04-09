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
  venueInfo?: string;
  timeslots?: any;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  weather?: {
    status: string;
    icon: string | null;
    temperature: number;
    lastUpdated: Date;
  };
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
    venueInfo: {
      type: String,
      default: "No additional information present",
    },
    timeslots: {
      type: [String],
      default: [
        "6:00 AM",
        "7:00 AM",
        "8:00 AM",
        "9:00 AM",
        "10:00 AM",
        "11:00 AM",
        "12:00 PM",
        "1:00 PM",
        "2:00 PM",
        "3:00 PM",
        "4:00 PM",
        "5:00 PM",
        "6:00 PM",
        "7:00 PM",
        "8:00 PM",
        "9:00 PM",
      ],
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    weather: {
      status: { type: String, default: null },
      icon: { type: String, default: null },
      temperature: { type: Number, default: null },
      lastUpdated: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

venueSchema.index({ location: "2dsphere" });

export const venueModel = mongoose.model<VenueDocument>("venues", venueSchema);
