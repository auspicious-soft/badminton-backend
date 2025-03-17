import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  
    identifier: {
      type: String,
      // required: true,
      unique: true,
    },
    image: {
      type: String,
      requried: true,
    },
    name: {
      type: String,
      requried: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export const eventsModel = mongoose.model("events", eventSchema);
