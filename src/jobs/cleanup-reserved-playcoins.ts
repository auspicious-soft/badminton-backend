
import { transactionModel } from "src/models/admin/transaction-schema";
import { additionalUserInfoModel } from "../models/user/additional-info-schema";
import mongoose from "mongoose";

/**
 * Job to clean up reserved playcoins for abandoned transactions
 * This should run periodically (e.g., every hour)
 */
export const cleanupReservedPlaycoins = async () => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    // Find transactions with reserved playcoins older than 1 hour
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 1);
    
    const abandonedTransactions = await transactionModel.find({
      method: "both",
      createdAt: { $lt: cutoffTime },
      status: "created" // Only for transactions that weren't completed
    });
    
    for (const transaction of abandonedTransactions) {
      // Release reserved playcoins
      await additionalUserInfoModel.findOneAndUpdate(
        { userId: transaction.userId },
        { $inc: { reservedPlayCoins: -transaction.playcoinsUsed } },
        { session }
      );
      
      // Update transaction
      await transactionModel.findByIdAndUpdate(
        transaction._id,
        { 
          playcoinsReserved: false,
          status: "abandoned"
        },
        { session }
      );
      
    }
    
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error("Error cleaning up reserved playcoins:", error);
  } finally {
    session.endSession();
  }
};

