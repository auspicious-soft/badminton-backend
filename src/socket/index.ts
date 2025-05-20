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

// Initialize socket events
export const initializeSocketEvents = (ioServer: Server) => {
  io = ioServer;
  
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const user = await authenticateSocket(socket);
      socket.data.user = user;
      next();
    } catch (error) {
      next(error as Error);
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

