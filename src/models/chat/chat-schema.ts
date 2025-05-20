import mongoose, { Schema, Document } from "mongoose";

// Interface for message document
export interface MessageDocument extends Document {
  sender: mongoose.Types.ObjectId;
  content: string;
  contentType: "text" | "image" | "video" | "audio" | "file" | "location";
  attachmentUrl?: string;
  metadata?: Record<string, any>;
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

// Interface for chat document
export interface ChatDocument extends Document {
  chatType: "individual" | "group";
  participants: mongoose.Types.ObjectId[];
  messages: MessageDocument[];
  lastMessage?: {
    content: string;
    sender: mongoose.Types.ObjectId;
    timestamp: Date;
    contentType: string;
  };
  groupName?: string;
  groupImage?: string;
  groupAdmin?: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema for individual messages
const messageSchema = new Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "location"],
      default: "text",
    },
    attachmentUrl: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
  },
  { timestamps: true }
);

// Main chat schema
const chatSchema = new Schema(
  {
    chatType: {
      type: String,
      enum: ["individual", "group"],
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true,
      },
    ],
    messages: [messageSchema],
    lastMessage: {
      content: {
        type: String,
      },
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      contentType: {
        type: String,
        enum: ["text", "image", "video", "audio", "file", "location"],
        default: "text",
      },
    },
    // Group chat specific fields
    groupName: {
      type: String,
      // Required only for group chats, handled in validation
    },
    groupImage: {
      type: String,
    },
    groupAdmin: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Validation for group chats
chatSchema.pre("save", function (next) {
  if (this.chatType === "group" && !this.groupName) {
    const error = new Error("Group name is required for group chats");
    return next(error);
  }
  
  // For individual chats, ensure exactly 2 participants
  if (this.chatType === "individual" && this.participants.length !== 2) {
    const error = new Error("Individual chats must have exactly 2 participants");
    return next(error);
  }
  
  next();
});

// Indexes for better query performance
chatSchema.index({ participants: 1 });
chatSchema.index({ "messages.sender": 1 });
chatSchema.index({ "messages.createdAt": 1 });
chatSchema.index({ chatType: 1 });
chatSchema.index({ isActive: 1 });

// Virtual for unread messages count
chatSchema.virtual("unreadCount").get(function(this: ChatDocument & { _currentUser: mongoose.Types.ObjectId }) {
  return this.messages.filter(
    (msg: MessageDocument) => !msg.readBy.includes(this._currentUser)
  ).length;
});

// Method to mark messages as read
chatSchema.methods.markAsRead = async function(userId: mongoose.Types.ObjectId) {
  for (const message of this.messages) {
    if (!message.readBy.includes(userId)) {
      message.readBy.push(userId);
    }
  }
  return this.save();
};

// Static method to find or create a chat between two users
chatSchema.statics.findOrCreateIndividualChat = async function(
  userId1: mongoose.Types.ObjectId,
  userId2: mongoose.Types.ObjectId
) {
  // Try to find existing chat
  const existingChat = await this.findOne({
    chatType: "individual",
    participants: { $all: [userId1, userId2] },
    isActive: true,
  });

  if (existingChat) {
    return existingChat;
  }

  // Create new chat if none exists
  return this.create({
    chatType: "individual",
    participants: [userId1, userId2],
    messages: [],
  });
};

export const chatModel = mongoose.model<ChatDocument>("chats", chatSchema);