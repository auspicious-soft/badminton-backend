// counter.model.ts
import mongoose, { Schema, Document } from "mongoose";

interface CounterDocument extends Document {
  name: string;
  seq: number;
  year: string;
}

const counterSchema = new Schema<CounterDocument>({
  name: { type: String, required: true },
  seq: { type: Number, default: 0 },
  year: { type: String, required: true }
});

export const Counter = mongoose.model<CounterDocument>("counters", counterSchema);
