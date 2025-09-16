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
import webhookRoutes from "./routes/webhook-routes";
import { downloadBookingReceipt } from "./controllers/admin/product-controller";
import { initializeFirebase } from "./utils/FCM/FCM";
import { bookingModel } from "./models/venue/booking-schema";
import { sendBookingInvoiceEmail } from "./utils/mails/mail";

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;
const app = express();

initializeFirebase();

// Create HTTP server
const server = http.createServer(app);

// Configure middleware

app.use(
  cors({
    origin: "*", // or "*" for all origins (not recommended for production)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

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
app.use("/api/webhooks", webhookRoutes);

app.get(
  "/api/booking-receipt/:bookingId",

  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const booking = await bookingModel
        .findById(bookingId)
        .populate("userId", "fullName email")
        .populate("venueId", "name address city state gstNumber")
        .populate("courtId", "name")
        .lean();

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const pdfBuffer = await downloadBookingReceipt(booking);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Booking-Invoice-${booking.invoiceNumber}.pdf"`,
        "Content-Length": pdfBuffer.length,
      });

      return res.send(pdfBuffer);
    } catch (err) {
      console.error("Error generating receipt:", err);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  }
);

// Use server.listen instead of app.listen
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));

// Set up Socket.IO with improved error handling
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Content-Length",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
  },
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Set the io instance
setIo(io);

// Initialize socket events
initializeSocketEvents(io);
