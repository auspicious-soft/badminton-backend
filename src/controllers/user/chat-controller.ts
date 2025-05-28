import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "../../lib/constant";
import { errorParser, formatErrorResponse } from "../../lib/errors/error-response-handler";
import { chatModel, ChatDocument } from "../../models/chat/chat-schema";
import { usersModel } from "../../models/user/user-schema";
import { io, sendToUser } from "../../socket";

// Get all chats for the current user
export const getUserChats = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const {type = "single"} = req.query;

    if(["single", "group"].includes(type as string) === false) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid type. Must be either 'single' or 'group'"
      });
    }
    
    // Get pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    // Set chatType filter based on the type parameter
    const chatTypeFilter = type === "single" ? "individual" : "group";
    
    // Find all chats where the user is a participant and of the requested type
    let chats = await chatModel
      .find({
        participants: userId,
        chatType: chatTypeFilter,
        isActive: true
      })
      .populate("participants", "fullName email profilePic")
      .populate("lastMessage.sender", "fullName email")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Format the response based on chat type
    const formattedChats = chats.map(chat => {
      const chatObj = chat.toObject();
      
      // Calculate unseen message count for this user
      const unseenCount = chatObj.messages.filter(
        (msg: any) => !msg.readBy.some((id: any) => id.toString() === userId)
      ).length;
      
      if (chatTypeFilter === "individual") {
        // For individual chats, add the other participant's info to the main object
        const otherParticipant = chatObj.participants.find(
          (p: any) => p._id.toString() !== userId
        );
        
        if (otherParticipant) {
          (chatObj as any).recipientName = (otherParticipant as any).fullName;
          (chatObj as any).recipientEmail = (otherParticipant as any).email;
          (chatObj as any).recipientProfilePic = (otherParticipant as any).profilePic;
          (chatObj as any).unseenCount = unseenCount;
        }
      } else if (chatTypeFilter === "group") {
        (chatObj as any).groupImage = chatObj.groupImage || null;
        (chatObj as any).unseenCount = unseenCount;
      }
      
      return chatObj;
    });
    
    // Count total chats for pagination
    const totalChats = await chatModel.countDocuments({
      participants: userId,
      chatType: chatTypeFilter,
      isActive: true
    });
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: `${chatTypeFilter} chats retrieved successfully`,
      data: {
        chats: formattedChats,
        pagination: {
          total: totalChats,
          page,
          limit,
          pages: Math.ceil(totalChats / limit)
        }
      }
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Get a single chat by ID
export const getChatById = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { chatId } = req.params;
    
    // Validate chat ID
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid chat ID format"
      });
    }
    
    // Find the chat and verify user is a participant
    const chat = await chatModel
      .findOne({
        _id: chatId,
        participants: userId,
        isActive: true
      })
      .populate("participants", "fullName email profilePic")
      .populate("messages.sender", "fullName email profilePic")
      .populate("messages.readBy", "fullName email");
    
    if (!chat) {
      return res.status(httpStatusCode.NOT_FOUND).json({
        success: false,
        message: "Chat not found or you're not a participant"
      });
    }
    
    // Mark all messages as read by this user
    const messagesToUpdate = chat.messages.filter(msg => 
      !msg.readBy.includes(new mongoose.Types.ObjectId(userId))
    );
    
    if (messagesToUpdate.length > 0) {
      messagesToUpdate.forEach(msg => {
        if (!msg.readBy.includes(new mongoose.Types.ObjectId(userId))) {
          msg.readBy.push(new mongoose.Types.ObjectId(userId));
        }
      });
      
      await chat.save();
    }
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Chat retrieved successfully",
      data: chat
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Create a new individual chat or return existing one
// export const createOrGetIndividualChat = async (req: Request, res: Response) => {
//   try {
//     const userData = req.user as any;
//     const userId = userData.id;
//     const { recipientId } = req.body;
    
//     // Validate recipient ID
//     if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
//       return res.status(httpStatusCode.BAD_REQUEST).json({
//         success: false,
//         message: "Valid recipient ID is required"
//       });
//     }
    
//     // Prevent creating chat with yourself
//     if (userId === recipientId) {
//       return res.status(httpStatusCode.BAD_REQUEST).json({
//         success: false,
//         message: "Cannot create chat with yourself"
//       });
//     }
    
//     // Check if recipient exists
//     const recipient = await usersModel.findById(recipientId);
//     if (!recipient) {
//       return res.status(httpStatusCode.NOT_FOUND).json({
//         success: false,
//         message: "Recipient user not found"
//       });
//     }
    
//     // Find existing chat or create new one
//     const existingChat = await chatModel.findOne({
//       chatType: "individual",
//       participants: { $all: [userId, recipientId] },
//       isActive: true
//     });
    
//     if (existingChat) {
//       return res.status(httpStatusCode.OK).json({
//         success: true,
//         message: "Existing chat retrieved",
//         data: existingChat
//       });
//     }
    
//     // Create new chat
//     const newChat = await chatModel.create({
//       chatType: "individual",
//       participants: [userId, recipientId],
//       messages: []
//     });
    
//     // Populate participant details
//     const populatedChat = await chatModel
//       .findById(newChat._id)
//       .populate("participants", "fullName email profilePic");
    
//     return res.status(httpStatusCode.CREATED).json({
//       success: true,
//       message: "New chat created successfully",
//       data: populatedChat
//     });
//   } catch (error: any) {
//     return formatErrorResponse(res, error);
//   }
// };

// Create a group chat
export const createGroupChat = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { groupName, participants, groupImage } = req.body;
    
    // Validate required fields
    if (!groupName || !participants || !Array.isArray(participants)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Group name and participants array are required"
      });
    }
    
    // Ensure at least 2 participants (excluding creator)
    if (participants.length < 2) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Group chat requires at least 3 participants (including you)"
      });
    }
    
    // Validate all participant IDs
    const validParticipants = participants.filter(id => 
      mongoose.Types.ObjectId.isValid(id)
    );
    
    if (validParticipants.length !== participants.length) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "One or more invalid participant IDs"
      });
    }
    
    // Check if all participants exist
    const existingUsers = await usersModel.find({
      _id: { $in: validParticipants }
    });

    if (existingUsers.length !== validParticipants.length) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "One or more participants do not exist"
      });
    }
    
    // Create group chat with creator as admin
    const allParticipants = [...new Set([userId, ...validParticipants])];
    
    const newGroupChat = await chatModel.create({
      chatType: "group",
      groupName,
      groupImage,
      participants: allParticipants,
      groupAdmin: [userId],
      messages: []
    });
    
    // Populate participant details
    const populatedChat = await chatModel
      .findById(newGroupChat._id)
      .populate("participants", "fullName email profilePic")
      .populate("groupAdmin", "fullName email");
    
    return res.status(httpStatusCode.CREATED).json({
      success: true,
      message: "Group chat created successfully",
      data: populatedChat
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Send a message in a chat
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { chatId, recipientId, content, contentType = "text", attachmentUrl, metadata } = req.body;
    
    let chat;
    
    // If chatId is provided, use existing chat
    if (chatId) {
      // Validate chat ID
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(httpStatusCode.BAD_REQUEST).json({
          success: false,
          message: "Invalid chat ID format"
        });
      }
      
      // Find the chat and verify user is a participant
      chat = await chatModel.findOne({
        _id: chatId,
        participants: userId,
        isActive: true
      });
      
      if (!chat) {
        return res.status(httpStatusCode.NOT_FOUND).json({
          success: false,
          message: "Chat not found or you're not a participant"
        });
      }
    } 
    // If recipientId is provided, find or create individual chat
    else if (recipientId) {
      // Validate recipient ID
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        return res.status(httpStatusCode.BAD_REQUEST).json({
          success: false,
          message: "Valid recipient ID is required"
        });
      }
      
      // Prevent creating chat with yourself
      if (userId === recipientId) {
        return res.status(httpStatusCode.BAD_REQUEST).json({
          success: false,
          message: "Cannot send message to yourself"
        });
      }
      
      // Check if recipient exists
      const recipient = await usersModel.findById(recipientId);
      if (!recipient) {
        return res.status(httpStatusCode.NOT_FOUND).json({
          success: false,
          message: "Recipient user not found"
        });
      }
      
      // Find existing chat or create new one
      chat = await chatModel.findOne({
        chatType: "individual",
        participants: { $all: [userId, recipientId] },
        isActive: true
      });
      
      if (!chat) {
        // Create new chat
        chat = await chatModel.create({
          chatType: "individual",
          participants: [userId, recipientId],
          messages: []
        });
      }
    } else {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Either chatId or recipientId is required"
      });
    }
    
    // Validate content
    if (!content) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Message content is required"
      });
    }
    
    // Create the new message
    const newMessage = {
      sender: new mongoose.Types.ObjectId(userId),
      content,
      contentType,
      attachmentUrl,
      metadata,
      readBy: [new mongoose.Types.ObjectId(userId)]
    };
    
    // Add message to chat
    chat.messages.push(newMessage as any);
    
    // Update last message
    chat.lastMessage = {
      content,
      sender: new mongoose.Types.ObjectId(userId),
      timestamp: new Date(),
      contentType
    };
    
    await chat.save();
    
    // Get the newly added message (last one in the array)
    const addedMessage = chat.messages[chat.messages.length - 1];
    
    // Emit socket event to all participants
    chat.participants.forEach((participantId) => {
      const participantIdStr = participantId.toString();
      if (participantIdStr !== userId) {
        sendToUser(participantIdStr, "new_message", {
          chatId: chat._id,
          message: {
            ...addedMessage.toObject(),
            sender: { _id: userId, fullName: userData.fullName, email: userData.email }
          }
        });
      }
    });
    
    // Emit to the chat room
    if (io) {  // Check if io is defined
      io.to(`chat:${chat._id}`).emit("chat_message", {
        chatId: chat._id,
        message: {
          ...addedMessage.toObject ? addedMessage.toObject() : addedMessage,
          sender: { _id: userId, fullName: userData.fullName, email: userData.email }
        }
      });
    }
    
    return res.status(httpStatusCode.CREATED).json({
      success: true,
      message: "Message sent successfully",
      data: {
        message: addedMessage,
        chat: {
          _id: chat._id,
          chatType: chat.chatType
        }
      }
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Get messages from a chat with pagination
export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { chatId } = req.params;
    
    // Get pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Validate chat ID
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid chat ID format"
      });
    }
    
    // Find the chat and verify user is a participant
    const chat = await chatModel.findOne({
      _id: chatId,
      participants: userId,
      isActive: true
    });
    
    if (!chat) {
      return res.status(httpStatusCode.NOT_FOUND).json({
        success: false,
        message: "Chat not found or you're not a participant"
      });
    }
    
    // Calculate pagination
    const totalMessages = chat.messages.length;
    const totalPages = Math.ceil(totalMessages / limit);
    
    // Sort messages in descending order (newest first) and apply pagination
    const startIndex = Math.max(0, totalMessages - (page * limit));
    const endIndex = Math.max(0, totalMessages - ((page - 1) * limit));
    
    // Get the slice of messages for the current page
    const paginatedMessages = chat.messages
      .slice(startIndex, endIndex)
      .reverse(); // Reverse to get chronological order
    
    // Mark messages as read
    const messagesToUpdate = chat.messages.filter(msg => 
      !msg.readBy.includes(new mongoose.Types.ObjectId(userId))
    );
    
    if (messagesToUpdate.length > 0) {
      messagesToUpdate.forEach(msg => {
        if (!msg.readBy.includes(new mongoose.Types.ObjectId(userId))) {
          msg.readBy.push(new mongoose.Types.ObjectId(userId));
        }
      });
      
      await chat.save();
    }
    
    // Populate sender information for each message
    const populatedChat = await chatModel
      .findById(chatId)
      .populate("participants", "fullName email profilePic")
      .populate({
        path: "messages.sender",
        select: "fullName email profilePic",
        model: "users"
      });
    
    // Get the populated messages
    const populatedMessages = populatedChat?.messages
      .slice(startIndex, endIndex)
      .reverse() || [];
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Messages retrieved successfully",
      data: {
        messages: populatedMessages,
        pagination: {
          total: totalMessages,
          page,
          limit,
          pages: totalPages
        }
      }
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Update group chat details (name, image)
export const updateGroupChat = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { chatId } = req.params;
    const { groupName, groupImage } = req.body;
    
    // Validate chat ID
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid chat ID format"
      });
    }
    
    // Find the group chat
    const chat = await chatModel.findOne({
      _id: chatId,
      chatType: "group",
      isActive: true
    });
    
    if (!chat) {
      return res.status(httpStatusCode.NOT_FOUND).json({
        success: false,
        message: "Group chat not found"
      });
    }
    
    // Check if user is an admin
    if (!chat.groupAdmin?.some(adminId => adminId.toString() === userId)) {
      return res.status(httpStatusCode.FORBIDDEN).json({
        success: false,
        message: "Only group admins can update group details"
      });
    }
    
    // Update fields if provided
    if (groupName) chat.groupName = groupName;
    if (groupImage) chat.groupImage = groupImage;
    
    await chat.save();
    
    // Notify all participants about the update
    chat.participants.forEach(participantId => {
      const participantIdStr = participantId.toString();
      sendToUser(participantIdStr, "group_updated", {
        chatId,
        groupName: chat.groupName,
        groupImage: chat.groupImage,
        updatedBy: userId
      });
    });
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Group chat updated successfully",
      data: chat
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Add participants to a group chat
export const addGroupParticipants = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { chatId } = req.params;
    const { participants } = req.body;
    
    // Validate inputs
    if (!chatId || !participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Chat ID and participants array are required"
      });
    }
    
    // Validate chat ID
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid chat ID format"
      });
    }
    
    // Find the group chat
    const chat = await chatModel.findOne({
      _id: chatId,
      chatType: "group",
      isActive: true
    });
    
    if (!chat) {
      return res.status(httpStatusCode.NOT_FOUND).json({
        success: false,
        message: "Group chat not found"
      });
    }
    
    // Check if user is an admin
    if (!chat.groupAdmin?.some(adminId => adminId.toString() === userId)) {
      return res.status(httpStatusCode.FORBIDDEN).json({
        success: false,
        message: "Only group admins can add participants"
      });
    }
    
    // Validate all participant IDs
    const validParticipants = participants.filter(id => 
      mongoose.Types.ObjectId.isValid(id)
    );
    
    if (validParticipants.length !== participants.length) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "One or more invalid participant IDs"
      });
    }
    
    // Check if all participants exist
    const existingUsers = await usersModel.find({
      _id: { $in: validParticipants }
    });

    if (existingUsers.length !== validParticipants.length) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "One or more participants do not exist"
      });
    }
    
    // Filter out users who are already participants
    const newParticipants = validParticipants.filter(
      id => !chat.participants.some(p => p.toString() === id)
    );
    
    if (newParticipants.length === 0) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "All users are already participants in this group"
      });
    }
    
    // Add new participants
    chat.participants.push(...newParticipants.map(id => new mongoose.Types.ObjectId(id)));
    await chat.save();
    
    // Notify all participants about the new members
    chat.participants.forEach(participantId => {
      const participantIdStr = participantId.toString();
      sendToUser(participantIdStr, "participants_added", {
        chatId,
        addedParticipants: newParticipants,
        addedBy: userId
      });
    });
    
    // Populate the updated chat
    const updatedChat = await chatModel
      .findById(chatId)
      .populate("participants", "fullName email profilePic")
      .populate("groupAdmin", "fullName email");
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Participants added successfully",
      data: updatedChat
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

// Remove a participant from a group chat
export const removeGroupParticipant = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData.id;
    const { chatId, participantId } = req.body;
    
    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(participantId)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid chat ID or participant ID format"
      });
    }
    
    // Find the group chat
    const chat = await chatModel.findOne({
      _id: chatId,
      chatType: "group",
      isActive: true
    });
    
    if (!chat) {
      return res.status(httpStatusCode.NOT_FOUND).json({
        success: false,
        message: "Group chat not found"
      });
    }
    
    // Check if user is an admin or the participant to be removed
    if (!chat.groupAdmin?.some(adminId => adminId.toString() === userId) && participantId.toString() !== userId) {
      return res.status(httpStatusCode.FORBIDDEN).json({
        success: false,
        message: "Only group admins can remove participants"
      });
    }
    
    // Remove the participant
    const updatedParticipants = chat.participants.filter(id => id.toString() !== participantId);
    
    if (updatedParticipants.length === chat.participants.length) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Participant not found in this group"
      });
    }
    
    chat.participants = updatedParticipants;
    
    // If the removed participant was an admin, remove them from the admin list
    if (chat.groupAdmin?.some(adminId => adminId.toString() === participantId)) {
      chat.groupAdmin = chat.groupAdmin.filter(id => id.toString() !== participantId);
    }
    
    await chat.save();
    
    // Notify all participants about the removal
    chat.participants.forEach(participantId => {
      const participantIdStr = participantId.toString();
      sendToUser(participantIdStr, "participant_removed", {
        chatId,
        removedParticipant: participantId,
        removedBy: userId
      });
    });
    
    // Populate the updated chat
    const updatedChat = await chatModel
      .findById(chatId)
      .populate("participants", "fullName email profilePic")
      .populate("groupAdmin", "fullName email");
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Participant removed successfully",
      data: updatedChat
    });
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};



