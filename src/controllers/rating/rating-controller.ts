import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import { addBookRatingService, deleteRatingService, getRatingService } from 'src/services/rating/rating-service';

export const AddBookRating = async (req: Request, res: Response) => {
  try {
    const response = await addBookRatingService(req.params.id, req.body,req.user,res );
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// export const createRating = async (req: Request, res: Response) => {
//   try {
//     const { bookId, rating, review } = req.body;
//     const newRating = await createRating(bookId, rating, review);
//     return res.status(httpStatusCode.CREATED).json(newRating);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };

export const getRating = async (req: Request, res: Response) => {
  try {
    const rating = await getRatingService(req.params.id,res);
    return res.status(httpStatusCode.OK).json(rating);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// export const updateRating = async (req: Request, res: Response) => {
//   try {
//     const { bookId } = req.params;
//     const { rating, review } = req.body;
//     const updatedRating = await updateRating(bookId, rating, review);
//     return res.status(httpStatusCode.OK).json(updatedRating);
//   } catch (error: any) {
//     const { code, message } = errorParser(error);
//     return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
//   }
// };

export const deleteRating = async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;
    await deleteRatingService(bookId,res);
    return res.status(httpStatusCode.NO_CONTENT).json({ success: true });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};