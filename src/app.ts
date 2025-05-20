import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db";
import { admin, auth, chat, user } from "./routes";
import { checkValidAdminRole } from "./utils";
import bodyParser from "body-parser";
import { checkAdminAuth, checkAuth } from "./middleware/check-auth";
import http from "http";
import { Server } from "socket.io";
import { setIo, initializeSocketEvents } from "./socket";

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Configure middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var dir = path.join(__dirname, "static");
app.use(express.static(dir));

var uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));

connectDB();

app.get("/", (_, res: any) => {
  res.send("Hello world entry point 🚀✅");
});

// Log when routes are mounted
app.use("/api/admin", checkValidAdminRole, checkAdminAuth, admin);
app.use("/api/user", checkAuth, user);
app.use("/api/chat", checkAuth, chat);
app.use("/api", auth);

// Use server.listen instead of app.listen
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));

// Set up Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With', 'Accept'],
  },
});

// Set the io instance
setIo(io);

// Initialize socket events
initializeSocketEvents(io);
