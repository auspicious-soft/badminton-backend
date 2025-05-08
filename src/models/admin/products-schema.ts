import mongoose, { Schema, Document } from "mongoose";

export interface ProductDocument extends Document {
  productName: string;
  description: string;
  specification: string;
  primaryImage: string;
  thumbnails: string[];
  actualPrice: number;
  discountedPrice: number;
  venueAndQuantity: {
    venueId: mongoose.Types.ObjectId;
    quantity: number;
  }[];
  reviews: {
    userId: mongoose.Types.ObjectId;
    name: string;
    rating: number;
    description: string;
    createdAt?: Date;
  }[];
  category?: string;
  subCategory?: string;
  tags?: string[];
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  averageRating?: number;
  totalReviews?: number;
}

const productSchema = new Schema<ProductDocument>(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    specification: {
      type: String,
      required: true,
    },
    primaryImage: {
      type: String,
      required: true,
    },
    thumbnails: [
      {
        type: String,
        required: true,
      },
    ],
    actualPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    venueAndQuantity: [
      {
        venueId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "venues",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
      },
    ],
    reviews: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        description: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    category: {
      type: String,
      trim: true,
    },
    subCategory: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Index for faster queries
productSchema.index({ productName: 1 });
productSchema.index({ category: 1 });
productSchema.index({ "venueAndQuantity.venueId": 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ averageRating: -1 });

// Virtual for calculating discount percentage
productSchema.virtual("discountPercentage").get(function () {
  if (this.actualPrice === 0) return 0;
  return Math.round(
    ((this.actualPrice - this.discountedPrice) / this.actualPrice) * 100
  );
});

// Pre-save middleware to update averageRating and totalReviews
productSchema.pre("save", function (next) {
  if (this.isModified("reviews")) {
    const reviews = this.reviews || [];
    this.totalReviews = reviews.length;

    if (reviews.length > 0) {
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      this.averageRating = parseFloat(
        (totalRating / reviews.length).toFixed(1)
      );
    } else {
      this.averageRating = 0;
    }
  }
  next();
});

// Method to check if product is in stock at a specific venue
productSchema.methods.isInStock = function (
  venueId: mongoose.Types.ObjectId
): boolean {
  interface VenueStock {
    venueId: mongoose.Types.ObjectId;
    quantity: number;
  }

  const venueStock = this.venueAndQuantity.find(
    (item: VenueStock) => item.venueId.toString() === venueId.toString()
  );
  return venueStock ? venueStock.quantity > 0 : false;
};

// Method to get total stock across all venues
productSchema.methods.getTotalStock = function (): number {
  interface VenueQuantity {
    venueId: mongoose.Types.ObjectId;
    quantity: number;
  }

  return (this.venueAndQuantity as VenueQuantity[]).reduce(
    (total, item) => total + item.quantity,
    0
  );
};

export const productModel = mongoose.model<ProductDocument>(
  "products",
  productSchema
);
