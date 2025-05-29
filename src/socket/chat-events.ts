import { Socket } from "socket.io";
import mongoose from "mongoose";
import { chatModel } from "src/models/chat/chat-schema";

export const setupChatEvents = (socket: Socket, userId: string) => {
  // Join a chat room
  socket.on("join_chat", async (chatId: string) => {
    try {
      // Verify the user is a participant in this chat
      const chat = await chatModel.findOne({
        _id: chatId,
        participants: userId,
        isActive: true,
      });

      if (!chat) {
        socket.emit("error", { 
          event: "join_chat",
          message: "Chat not found or you're not a participant" 
        });
        return;
      }

      // Join the chat room
      socket.join(`chat:${chatId}`);
      console.log(`User ${userId} joined chat room ${chatId}`);
      
      // Acknowledge successful join
      socket.emit("chat_joined", { chatId });
    } catch (error) {
      console.error(`Error joining chat ${chatId}:`, error);
      socket.emit("error", { 
        event: "join_chat",
        message: "Failed to join chat room" 
      });
    }
  });

  // Leave a chat room
  socket.on("leave_chat", (chatId: string) => {
    socket.leave(`chat:${chatId}`);
    console.log(`User ${userId} left chat room ${chatId}`);
    socket.emit("chat_left", { chatId });
  });

  // User is typing indicator
  socket.on("typing", (data: { chatId: string, isTyping: boolean }) => {
    const { chatId, isTyping } = data;
    
    // Broadcast to everyone in the chat room except the sender
    socket.to(`chat:${chatId}`).emit("user_typing", {
      chatId,
      userId,
      isTyping
    });
  });

  // Basic message sending (we'll expand this later)
  socket.on("send_message", async (data: {
    chatId: string;
    content: string;
    contentType?: string;
  }) => {
    try {
      const { chatId, content, contentType = "text" } = data;
      
      // Validate input
      if (!chatId || !content) {
        socket.emit("error", { 
          event: "send_message",
          message: "Chat ID and message content are required" 
        });
        return;
      }

      // Acknowledge receipt of message
      socket.emit("message_received", {
        chatId,
        content,
        timestamp: new Date().toISOString()
      });

      console.log(`Message from ${userId} to chat ${chatId}: ${content}`);
      
      // We'll implement the actual message saving in the next step
    } catch (error) {
      console.error("Error in send_message:", error);
      socket.emit("error", { 
        event: "send_message",
        message: "Failed to process message" 
      });
    }
  });
};