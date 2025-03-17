import { Request, Response } from 'express';
import { createEvent, getEventById, updateEvent, deleteEvent, getAllEvents } from '../../services/events/events-service';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';

export const createEventHandler = async (req: Request, res: Response) => {
   
    try {
      const response = await createEvent(req.body)
      return res.status(httpStatusCode.CREATED).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getEventByIdHandler = async (req: Request, res: Response) => {
   
    try {
      const response = await getEventById(req.params.id);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateEventHandler = async (req: Request, res: Response) => {
    try {
      const response = await updateEvent(req.params.id, req.body);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteEventHandler = async (req: Request, res: Response) => {
 
    try {
      const response = await deleteEvent(req.params.id , res);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getAllEventsHandler = async (req: Request, res: Response) => {
    try {
      const response = await getAllEvents(req.query);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
