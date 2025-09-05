import mongoose, { Schema, Document, Model } from "mongoose";

export interface DynamicPrizeDocument extends Document {
  venueId: mongoose.Types.ObjectId;
  courtId: mongoose.Types.ObjectId;
  date: Date;
  slotPricing: {
    slot: string;
    price: number;
  }[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const dynamicPrizeSchema = new Schema<DynamicPrizeDocument>(
  {
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "venues",
      required: true,
    },
    courtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "courts",
      required: true,
    },
    date: { type: Date, required: true },
    slotPricing: [
      {
        slot: { type: String, required: true },
        price: { type: Number, required: true },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const dynamicPrizeModel = mongoose.model<
  DynamicPrizeDocument,
  Model<DynamicPrizeDocument>
>("DynamicPrize", dynamicPrizeSchema);
