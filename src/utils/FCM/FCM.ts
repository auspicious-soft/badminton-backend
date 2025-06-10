import admin from "firebase-admin";
import mongoose from "mongoose";
import { createNotification } from "src/models/notification/notification-schema";

export interface NotificationMessage {
  notification: {
    title: string;
    body: string;
    metadata?: Record<string, any>;
  };
  data?: Record<string, string>;
  token: string;
}

export const sendNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> => {
  const stringifiedData: Record<string, string> = {};
  for (const key in data) {
    stringifiedData[key] = String(data[key]);
  }
  const message: NotificationMessage = {
    notification: { title, body },
    data: stringifiedData,
    token: fcmToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`Successfully sent FCM message: ${response}`);
  } catch (error) {
    console.warn(`⚠️ Failed to send notification to token ${fcmToken}:`, error);
    throw error;
  }
};

export const notifyUser = async ({
  recipientId,
  type,
  title,
  message,
  category,
  priority = "MEDIUM",
  referenceId,
  referenceType,
  metadata = {},
  notificationType = "BOTH",
  expiresAt,
  session,
}: {
  recipientId: mongoose.Types.ObjectId | string;
  type: string;
  title: string;
  message: string;
  category: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  referenceId?: mongoose.Types.ObjectId | string;
  referenceType?: string;
  metadata?: Record<string, any>;
  notificationType?: "PUSH" | "IN_APP" | "BOTH";
  expiresAt?: Date;
  session?: mongoose.ClientSession;
}) => {
  // Validate recipientId
  const validRecipientId = mongoose.Types.ObjectId.isValid(recipientId)
    ? new mongoose.Types.ObjectId(recipientId)
    : null;
  if (!validRecipientId) {
    throw new Error(`Invalid recipientId: ${recipientId}`);
  }

  // Validate referenceId
  const validReferenceId = referenceId && mongoose.Types.ObjectId.isValid(referenceId)
    ? new mongoose.Types.ObjectId(referenceId)
    : undefined;

  // Validate type and category against schema enums
  const validTypes = [
    "FRIEND_REQUEST", "FRIEND_REQUEST_ACCEPTED", "FRIEND_REQUEST_REJECTED",
    "GAME_INVITATION", "GAME_REQUEST_ACCEPTED", "GAME_REQUEST_REJECTED",
    "GAME_CANCELLED", "GAME_REMINDER", "GAME_STARTED", "GAME_COMPLETED",
    "PLAYER_LEFT_GAME", "PLAYER_JOINED", "ORDER_PLACED", "ORDER_CONFIRMED",
    "ORDER_DELIVERED", "NEW_MESSAGE", "GROUP_MESSAGE", "GROUP_INVITATION",
    "GROUP_ADMIN_CHANGED", "MENTIONED_IN_CHAT", "PAYMENT_PENDING",
    "PAYMENT_SUCCESS", "PAYMENT_FAILED", "REFUND_INITIATED", "REFUND_COMPLETED",
    "REFUND_FAILED", "PAYMENT_REMINDER", "PAYMENT_ALREADY_PROCESSED",
    "SYSTEM_MAINTENANCE", "ACCOUNT_UPDATE", "SECURITY_ALERT", "NEW_FEATURE",
    "VENUE_UPDATE", "BOOKING_CONFIRMATION", "BOOKING_CANCELLED", "VENUE_MAINTENANCE",
    "CUSTOM",
  ];
  const validCategories = [
    "FRIEND", "GAME", "CHAT", "PAYMENT", "SYSTEM", "VENUE", "BOOKING", "CUSTOM", "ORDER",
  ];

  if (!validTypes.includes(type)) {
    throw new Error(`Invalid notification type: ${type}`);
  }
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  // Fetch user
  const user = await mongoose.model("users").findById(validRecipientId, null, { session });
  if (!user) {
    throw new Error(`User not found for recipientId: ${validRecipientId}`);
  }

  // Send push notifications
  if (notificationType === "PUSH" || notificationType === "BOTH") {
    if (user.fcmToken && user.fcmToken.length > 0) {
      for (const token of user.fcmToken) {
        if (!token) continue;
        try {
          console.log(`Sending notification to ${user.fullName} (token: ${token})`);
          await sendNotification(token, title, message, metadata);
        } catch (error) {
          console.warn(`Failed to send notification to token ${token}:`, error);
        }
      }
    } else {
      console.warn(`No FCM tokens found for user ${validRecipientId}`);
    }
  }

  // Save in-app notifications
  if (notificationType === "IN_APP" || notificationType === "BOTH") {
    try {
      console.log(`Saving in-app notification:`, {
        recipientId: validRecipientId,
        type,
        category,
        referenceId: validReferenceId,
        referenceType,
      });
      const notification = await createNotification(
        {
          recipientId: validRecipientId,
          type,
          title,
          message,
          category,
          priority,
          referenceId: validReferenceId,
          referenceType,
          metadata,
          notificationType,
          expiresAt,
        },
        { session }
      );
      console.log(`Successfully saved notification: ${notification._id}`);
      return notification;
    } catch (error) {
      console.error(`❌ Error saving notification to DB:`, error);
      throw error; // Propagate error to caller
    }
  }
};