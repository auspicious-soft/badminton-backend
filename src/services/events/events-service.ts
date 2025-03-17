import { customAlphabet } from "nanoid";
import { eventsModel } from "../../models/events/events-schema";
import { queryBuilder } from "src/utils";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { httpStatusCode } from "src/lib/constant";
import { deleteFileFromS3 } from "src/config/s3";
import { Response } from "express";

export interface Event {
  _id?: string;
  identifier: string;
  image: string;
  name: string;
  description: string;
}

export const createEvent = async (eventData: Event) => {
  const identifier = customAlphabet("0123456789", 3);
  eventData.identifier = identifier();
  const event = new eventsModel(eventData);
  const savedEvent = await event.save();
  return {savedEvent, success: true, message: "Event created successfully"};
};

export const getEventById = async (eventId: string): Promise<Event | null> => {
  return await eventsModel.findById(eventId);
};

export const updateEvent = async (
  eventId: string,
  eventData: Event
): Promise<Event | null> => {
  return await eventsModel.findByIdAndUpdate(eventId, eventData, { new: true });
};
export const deleteEvent = async (eventId: string, res :Response ) => {
  const deletedEvent= await eventsModel.findByIdAndDelete(eventId);
  if (!deletedEvent) return errorResponseHandler("Book Event not found", httpStatusCode.NOT_FOUND, res);
  if (deletedEvent?.image) {
    await deleteFileFromS3(deletedEvent.image);
    }
    return {
      success: true,
      message: "Book Event deleted successfully",
      data: deletedEvent,
    };
};

export const getAllEvents = async (payload: any) => {
  const page = parseInt(payload.page as string) || 1
  const limit = parseInt(payload.limit as string) || 0
  const offset = (page - 1) * limit
  const { query, sort } = queryBuilder(payload, ['name'])
 
  const totalDataCount = Object.keys(query).length < 1 ? await eventsModel.countDocuments() : await eventsModel.countDocuments(query)
  const results = await eventsModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v")
  if (results.length) return {
      page,
      limit,
      success: true,
      message: "Events retrieved successfully",
      total: totalDataCount,
      data: results
  }
  else {
      return {
          data: [],
          page,
          limit,
          success: false,
          message: "No events found",
          total: 0
      }
  }
}
