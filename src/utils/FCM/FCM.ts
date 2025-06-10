import admin from "firebase-admin";
import { configDotenv } from "dotenv";
import mongoose from "mongoose";
import { createNotification } from "src/models/notification/notification-schema";
configDotenv();

export const initializeFirebase = () => {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("Missing Firebase service account credentials");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    serviceAccount.private_key = serviceAccount.private_key.replace(
      /\\n/g,
      "\n"
    );

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized");
    }
  } catch (error) {
    console.error("❌ Error initializing Firebase:", error);
    throw error;
  }
};

export interface NotificationMessage {
  notification: {
    title: string;
    body: string;
    metadata?: Record<string, any>;
  };
  data?: Record<string, string>;
  token: string;
}

export interface NotificationPayload {
  title: string;
  description: string;
  userIds?: string[];
}

export const sendNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {} // Optional data payload
): Promise<void> => {
  const stringifiedData: Record<string, string> = {};
  for (const key in data) {
    stringifiedData[key] = String(data[key]);
  }
  const message: NotificationMessage = {
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    token: fcmToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Successfully sent FCM message:", response);
  } catch (error) {
    console.error("Error sending FCM message:", error);
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
  session
}: {
  recipientId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  category: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  referenceId?: mongoose.Types.ObjectId;
  referenceType?: string;
  metadata?: Record<string, any>;
  notificationType?: "PUSH" | "IN_APP" | "BOTH";
  expiresAt?: Date;
  session?: mongoose.ClientSession;
}) => {
  let user = await mongoose.model("users").findById(recipientId);
  if (notificationType === "PUSH" || notificationType === "BOTH") {
    for (const token of user.fcmToken) {
      if (!token) continue;
      try {
        console.log(`✅ ✅ ✅ Sending ✅ ✅ ✅ notification ✅ ✅ ✅ ${user?.fullName}`);
        await sendNotification(token, title, message, metadata);
      } catch (error) {
        console.warn(`⚠️ Failed to send notification to token ${token}`);
      }
    }
  }

  if (notificationType === "IN_APP" || notificationType === "BOTH") {
    try {
      await createNotification({
        recipientId,
        type,
        title,
        message,
        category,
        priority,
        referenceId,
        referenceType,
        metadata,
        notificationType,
        expiresAt,
      },
      { session });
    } catch (error) {
      console.error("❌ Error saving notification to DB:", error);
    }
  }
};
