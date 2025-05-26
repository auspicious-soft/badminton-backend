import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import mongoose from "mongoose";

/**
 * Ensures that an additional user info document exists for the given user ID
 * If it doesn't exist, creates it with default values
 * 
 * @param userId - The user ID to ensure additional info for
 * @returns The additional user info document
 */
export const ensureAdditionalUserInfo = async (userId: string | mongoose.Types.ObjectId) => {
  // Check if additional info exists
  let additionalInfo = await additionalUserInfoModel.findOne({ userId });
  
  // If not, create it with default values
  if (!additionalInfo) {
    additionalInfo = await additionalUserInfoModel.create({
      userId,
      playCoins: 0,
      loyaltyPoints: 0,
      loyaltyTier: "Bronze",
      notificationPreferences: {
        gameInvites: true,
        friendRequests: true,
        bookingReminders: true,
        promotions: true,
        systemUpdates: true,
        nearbyEvents: true,
      },
      clubMember: false,
      playerRating: 0,
    });
  }
  
  return additionalInfo;
};