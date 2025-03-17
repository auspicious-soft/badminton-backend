import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import {
  createCourseLessonService,
  deleteCourseLanguageService,
  deleteCourseLessonService,
  deleteSublessonsService,
  getCourseLessonByIdForUserService,
  getCourseLessonByIdService,
  updateCourseLessons,
} from "src/services/course-lessons/course-lessons-service";

export const createCourseLesson = async (req: Request, res: Response) => {
  try {
    const { bookDetails, lessons } = req.body;
    const newCourseLesson = await createCourseLessonService(bookDetails, lessons, res);
    return res.status(httpStatusCode.CREATED).json(newCourseLesson);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const getCourseLesson = async (req: Request, res: Response) => {
  try {
    const courseLesson = await getCourseLessonByIdService(req.query, req.params.id);
    return res.status(httpStatusCode.OK).json(courseLesson);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const getCourseLessonForUser = async (req: Request, res: Response) => {
  try {
    const courseLesson = await getCourseLessonByIdForUserService(req.user, req.query, req.params.id);
    return res.status(httpStatusCode.OK).json(courseLesson);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const updateCourseLesson = async (req: Request, res: Response) => {
  try {
    const updatedCourseLesson = await updateCourseLessons(req.body);
    return res.status(httpStatusCode.OK).json(updatedCourseLesson);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    const responses= res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    return responses
  }
};

export const deleteCourseLesson = async (req: Request, res: Response) => {
  try {
    const response = await deleteCourseLessonService(req.params.id, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const deleteSubLesson = async (req: Request, res: Response) => {
  try {
    const response = await deleteSublessonsService(req.params.id,req.params.subLessonId, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const deleteCourseLanguage  = async (req: Request, res: Response) => {
  try {

    const response = await deleteCourseLanguageService(req.params.productId, req.query.lang, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
