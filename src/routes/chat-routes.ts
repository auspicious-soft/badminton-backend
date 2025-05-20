import express from "express";
import {
  getUserChats,
  getChatById,
  createOrGetIndividualChat,
  createGroupChat,
  sendMessage,
  getChatMessages,
  updateGroupChat,
  addGroupParticipants,
  removeGroupParticipant
} from "src/controllers/user/chat-controller";

// router
const router = express.Router();

// Get all chats for the user
router.get("/get-chats", getUserChats); 

// Get a single chat by ID
router.get("/:chatId", getChatById);

// Get messages from a chat with pagination
router.get("/:chatId/messages", getChatMessages);

// Create a new individual chat or return existing one
router.post("/individual", createOrGetIndividualChat);

// Create a group chat
router.post("/group", createGroupChat);

// Send a message in a chat
router.post("/message", sendMessage);

// Update group chat details (name, image)
router.put("/group/:chatId", updateGroupChat);

// Add participants to a group chat
router.post("/group/:chatId/participants", addGroupParticipants);

// Remove a participant from a group chat
router.delete("/group/removeParticipant", removeGroupParticipant);

export { router };

