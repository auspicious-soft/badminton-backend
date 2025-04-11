import mongoose, { Schema, Document } from "mongoose";
export interface FriendDocument extends Document {
  userId: mongoose.Types.ObjectId;
  friendId: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "rejected" | "blocked";
  requestedAt: Date;
  updatedAt: Date;
}
const friendSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    friendId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },
    requestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

friendSchema.index({ userId: 1, status: 1 });
friendSchema.index({ friendId: 1, status: 1 });

export const friendsModel = mongoose.model<FriendDocument>(
  "friends",
  friendSchema
);
