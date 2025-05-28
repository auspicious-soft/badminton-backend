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

  // Add error event handler for the engine
  io.engine.on("connection_error", (err) => {
    console.error("Socket.IO connection error:", err);
  });

  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      // Get token from query params or auth object with more flexible parsing
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      // If token is an array, take the first element
      if (Array.isArray(token)) {
        token = token[0];
      }
      
      // Log connection attempt details
      console.log("Socket connection attempt:", {
        id: socket.id,
        hasToken: !!token,
        tokenLength: token ? String(token).length : 0,
        query: socket.handshake.query,
        headers: socket.handshake.headers,
        url: socket.handshake.url
      });

      if (!token) {
        return next(new Error("Authentication error: Token not provided"));
      }

      try {
        const user = await authenticateSocket(socket);
        socket.data.user = user;
        console.log(`Socket authenticated for user: ${user.id}`);
        next();
      } catch (authError: any) {
        console.error("Socket authentication error:", authError);
        next(
          new Error(`Authentication failed: ${(authError as Error).message}`)
        );
      }
    } catch (error) {
      console.error("Unexpected error in socket middleware:", error);
      next(new Error("Server error during authentication"));
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

      // Broadcast user's online status to others
      socket.broadcast.emit("user_status_change", {
        userId,
        status: "online",
      });

      // Send list of online users to the newly connected user
      socket.emit("online_users", getOnlineUsers());

      // Set up chat-specific event handlers
      setupChatEvents(socket, userId);

      // Handle user disconnection
      socket.on("disconnect", () => {
        console.log(`User disconnected: ${userId} (Socket ID: ${socket.id})`);
        connectedUsers.delete(userId);

        // Broadcast user's offline status
        socket.broadcast.emit("user_status_change", {
          userId,
          status: "offline",
        });
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

