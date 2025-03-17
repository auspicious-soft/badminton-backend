import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import { getAllFaviouriteBooksService, getAllFinishedBooksService, getAllReadingBooksService, getCoursesBookRoomService } from 'src/services/book-room/book-room-service';


export const getAllReadingBooks = async (req: Request, res: Response) => {
    try {
      const response = await getAllReadingBooksService(req.user, req.query);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const getAllFinishedBooks = async (req: Request, res: Response) => {
    try {
      const response = await getAllFinishedBooksService(req.user, req.query);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const getAllFaviouriteBooks = async (req: Request, res: Response) => {
    try {
      const response = await getAllFaviouriteBooksService(req.user, req.query);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const getCoursesForBookRoom = async (req: Request, res: Response) => {
    try {
      const response = await getCoursesBookRoomService(req.user, req.query);
      return res.status(httpStatusCode.OK).json(response)
  } catch (error: any) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
