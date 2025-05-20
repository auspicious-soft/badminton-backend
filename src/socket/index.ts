import { Server, Socket } from "socket.io";
import { authenticateSocket } from "../middleware/check-auth";
import { setupChatEvents } from "./chat-events";

// Store connected users
const connectedUsers = new Map<string, Socket>();

// Store the io instance
let io: Server;

// Function to set the io instance
export const setIo = (ioServer: Server) => {
  io = ioServer;
};

// Initialize socket events with better error handling
export const initializeSocketEvents = (ioServer: Server) => {
  io = ioServer;
  
  // Add error event handler for the engine
  io.engine.on("connection_error", (err) => {
    console.error("Socket.IO connection error:", err);
  });
  
  // Middleware for authentication with better error handling
  io.use(async (socket, next) => {
    try {
      console.log("Socket connection attempt with query params:", socket.handshake.query);
      console.log("Socket connection attempt with auth:", socket.handshake.auth);
      
      const token = 
        socket.handshake.auth.token || 
        socket.handshake.query.token;
      
      if (!token) {
        console.log("No token found in socket handshake");
        return next(new Error("Authentication error: Token not provided"));
      }
      
      try {
        const user = await authenticateSocket(socket);
        socket.data.user = user;
        console.log("Socket authenticated successfully for user:", user.id);
        next();
      } catch (authError) {
        console.error("Socket authentication error:", authError);
        next(new Error(authError instanceof Error ? authError.message : "Authentication failed"));
      }
    } catch (error) {
      console.error("Unexpected error in socket middleware:", error);
      next(new Error("Server error"));
    }
  });

  io.on("connection", async (socket) => {
    try {
      const user = socket.data.user;
      const userId = user.id;

      console.log(`User connected: ${userId} (Socket ID: ${socket.id})`);

      // Store user connection
      connectedUsers.set(userId, socket);

      // Join a room with the user's ID to allow direct messaging
      socket.join(userId);

      // Inform user of successful connection
      socket.emit("connection_success", {
        message: "Successfully connected to chat server",
        userId: userId,
      });
      
      // Set up chat-specific event handlers
      setupChatEvents(socket, userId);

      // Handle user disconnection
      socket.on("disconnect", () => {
        console.log(`User disconnected: ${userId} (Socket ID: ${socket.id})`);
        connectedUsers.delete(userId);
      });
    } catch (error) {
      console.error("Error handling socket connection:", error);
      socket.disconnect();
    }
  });
};

// Helper function to check if a user is online
export const isUserOnline = (userId: string): boolean => {
  return connectedUsers.has(userId);
};

// Helper function to get all online users
export const getOnlineUsers = (): string[] => {
  return Array.from(connectedUsers.keys());
};

// Helper function to send a message to a specific user
export const sendToUser = (
  userId: string,
  event: string,
  data: any
): boolean => {
  const socket = connectedUsers.get(userId);
  if (socket) {
    socket.emit(event, data);
    return true;
  }
  return false;
};

// Export io instance
export { io };


