import mongoose, { Schema, Document } from "mongoose";

export interface PriceDocument extends Document {
  name: string;
  description?: string;
  dayType: "weekday" | "weekend" | "holiday";
  slotPricing: {
    slot: string;
    price: number;
  }[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const priceSchema = new Schema<PriceDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    dayType: {
      type: String,
      enum: ["weekday", "weekend", "holiday"],
      required: true,
    },
    slotPricing: [
      {
        slot: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
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

// Index for efficient queries
priceSchema.index({ name: 1, dayType: 1 }, { unique: true });

// Validate that each slot has a price
priceSchema.pre("save", function (next) {
  if (!this.slotPricing || this.slotPricing.length === 0) {
    return next(new Error("At least one slot with pricing is required"));
  }
  
  // Check for duplicate slots
  const slots = this.slotPricing.map(item => item.slot);
  const uniqueSlots = new Set(slots);
  if (slots.length !== uniqueSlots.size) {
    return next(new Error("Duplicate slots are not allowed"));
  }
  
  // Validate price values
  const invalidPrices = this.slotPricing.filter(item => item.price < 0);
  if (invalidPrices.length > 0) {
    return next(new Error("All prices must be non-negative"));
  }
  
  next();
});

// Method to get price for a specific slot
priceSchema.methods.getPriceForSlot = function(slot: string): number | null {
interface SlotPricing {
    slot: string;
    price: number;
}
const slotPricing = this.slotPricing.find((item: SlotPricing) => item.slot === slot);
  return slotPricing ? slotPricing.price : null;
};

// Static method to find price for a specific pricing plan and slot
priceSchema.statics.findPriceForSlot = async function(
  pricingName: string,
  dayType: string,
  slot: string
): Promise<number | null> {
  const pricing = await this.findOne({
    name: pricingName,
    dayType,
    isActive: true,
  }).lean();
  
  if (!pricing) return null;
  
interface SlotPricing {
    slot: string;
    price: number;
}
const slotPricing: SlotPricing | undefined = pricing.slotPricing.find((item: SlotPricing) => item.slot === slot);
  return slotPricing ? slotPricing.price : null;
};

export const priceModel = mongoose.model<PriceDocument>("prices", priceSchema);
