import mongoose, { Schema, Document } from "mongoose";

export interface PlaycoinModel extends Document {
  amount: number;
  coinReceivable?: number;
  extraCoins: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const playcoinSchema = new Schema<PlaycoinModel>(
  {
    amount: {
      type: Number,
      requird: true,
    },
    coinReceivable: {
      type: Number,
      requird: true,
    },
    extraCoins: {
      type: Number,
      requird: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const playcoinModel = mongoose.model<PlaycoinModel>("playcoin", playcoinSchema);
