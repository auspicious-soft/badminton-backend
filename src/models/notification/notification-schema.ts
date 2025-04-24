import mongoose, { Schema, Document } from "mongoose";

export interface NotificationDocument extends Document {
  recipientId: mongoose.Types.ObjectId;
  senderId?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  notificationType: "PUSH" | "IN_APP" | "BOTH";
  category: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  referenceId?: mongoose.Types.ObjectId;
  referenceType?: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  isDeleted: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    type: {
      type: String,
      required: true,
      enum: [
        // Friend related
        "FRIEND_REQUEST",
        "FRIEND_REQUEST_ACCEPTED",
        "FRIEND_REQUEST_REJECTED",

        // Game/Booking related
        "GAME_INVITATION",
        "GAME_REQUEST_ACCEPTED",
        "GAME_REQUEST_REJECTED",
        "GAME_CANCELLED",
        "GAME_REMINDER",
        "GAME_STARTED",
        "GAME_COMPLETED",
        "PLAYER_LEFT_GAME",
        "PLAYER_JOINED_GAME",

        // Chat related
        "NEW_MESSAGE",
        "GROUP_MESSAGE",
        "GROUP_INVITATION",
        "GROUP_ADMIN_CHANGED",
        "MENTIONED_IN_CHAT",

        // Payment related
        "PAYMENT_PENDING",
        "PAYMENT_SUCCESSFUL",
        "PAYMENT_FAILED",
        "REFUND_INITIATED",
        "REFUND_COMPLETED",
        "PAYMENT_REMINDER",

        // System notifications
        "SYSTEM_MAINTENANCE",
        "ACCOUNT_UPDATE",
        "SECURITY_ALERT",
        "NEW_FEATURE",

        // Venue related
        "VENUE_UPDATE",
        "BOOKING_CONFIRMATION",
        "BOOKING_CANCELLED",
        "VENUE_MAINTENANCE",

        // Custom notifications
        "CUSTOM",
      ],
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    notificationType: {
      type: String,
      enum: ["PUSH", "IN_APP", "BOTH"],
      default: "BOTH",
    },
    category: {
      type: String,
      enum: ["FRIEND", "GAME", "CHAT", "PAYMENT", "SYSTEM", "VENUE", "CUSTOM"],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["HIGH", "MEDIUM", "LOW"],
      default: "MEDIUM",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "referenceType",
    },
    referenceType: {
      type: String,
      enum: [
        "users",
        "bookings",
        "booking_requests",
        "transactions",
        "venues",
        "courts",
        "chats",
        "chat_groups",
      ],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, category: 1, createdAt: -1 });

// TTL index for auto-deletion of expired notifications
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Methods
notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  await this.save();
};

notificationSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  await this.save();
};

// Static methods
notificationSchema.statics.getUnreadCount = async function (userId: string) {
  return this.countDocuments({
    recipientId: userId,
    isRead: false,
    isDeleted: false,
  });
};

notificationSchema.statics.markAllAsRead = async function (userId: string) {
  return this.updateMany(
    {
      recipientId: userId,
      isRead: false,
      isDeleted: false,
    },
    {
      $set: { isRead: true },
    }
  );
};

// Example usage of metadata for different notification types
const metadataExamples: {
  FRIEND_REQUEST: {
    senderName: string;
    senderProfilePic: string;
  };
  GAME_INVITATION: {
    gameId: string;
    venueName: string;
    dateTime: Date;
    gameType: string;
  };
  PAYMENT_SUCCESSFUL: {
    transactionId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
  };
  NEW_MESSAGE: {
    chatId: string;
    messagePreview: string;
    senderName: string;
  };
} = {
  FRIEND_REQUEST: {
    senderName: "",
    senderProfilePic: "",
  },
  GAME_INVITATION: {
    gameId: "",
    venueName: "",
    dateTime: new Date(),
    gameType: "",
  },
  PAYMENT_SUCCESSFUL: {
    transactionId: "",
    amount: 0,
    currency: "",
    paymentMethod: "",
  },
  NEW_MESSAGE: {
    chatId: "",
    messagePreview: "",
    senderName: "",
  },
};

export const notificationModel = mongoose.model<NotificationDocument>(
  "notifications",
  notificationSchema
);

// Helper function to create notifications
export const createNotification = async ({
  recipientId,
  senderId,
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
}: {
  recipientId: mongoose.Types.ObjectId;
  senderId?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  category: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  referenceId?: string;
  referenceType?: string;
  metadata?: Record<string, any>;
  notificationType?: "PUSH" | "IN_APP" | "BOTH";
  expiresAt?: Date;
}) => {
  return await notificationModel.create({
    recipientId,
    senderId,
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
  });
};
