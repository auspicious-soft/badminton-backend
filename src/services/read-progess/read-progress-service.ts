import { readProgressModel } from "../../models/user-reads/read-progress-schema";
import { queryBuilder } from "src/utils";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { badges, httpStatusCode } from "src/lib/constant";
import { Response } from "express";
import { awardsModel } from "src/models/awards/awards-schema";

// export interface ReadProgress {
//   _id?: string;
//   userId: string;
//   bookId: string;
//   progress: number;
//   readSections: any;
// }

export const getReadProgressById = async (readProgressId: string, userId: string) => {
  return await readProgressModel.findOne({ userId, bookId: readProgressId }).populate([{ path: "bookId" }, { path: "readSections.sectionId" }]);
};

export const updateReadProgress = async (readProgressId: string, readProgressData: any, user: any, res: Response) => {
  console.log('readProgressData: ', readProgressData);
  if (readProgressData.progress < 0 || readProgressData.progress > 100) {
    return errorResponseHandler("Progress must be between 0 and 100", httpStatusCode.BAD_REQUEST, res);
  }
  const userId = user.id;
  let updatedBadge = null;

  const updateData: any = { progress: readProgressData.progress };
  if (readProgressData.courseLessonId && readProgressData.sectionId) {
    updateData.$push = { readSections: { courseLessonId: readProgressData.courseLessonId, sectionId: readProgressData.sectionId } };
  }

  const ReadProgress = await readProgressModel.findOneAndUpdate(
    { userId, bookId: readProgressId },
    updateData,
    { new: true, upsert: true }
  ).populate("bookId");

  if (!ReadProgress) {
    return errorResponseHandler("Read Progress not found", httpStatusCode.NOT_FOUND, res);
  }

  if (readProgressData.progress === 100) {
    const bookRead = await readProgressModel.countDocuments({ userId, progress: 100 });
    const awardedBadge = badges.find(({ count }) => bookRead === count);

    if (awardedBadge) {
      updatedBadge = await awardsModel.findOneAndUpdate({ userId }, { level: awardedBadge.level, badge: awardedBadge.badge }, { new: true, upsert: true });
    }
  }

  return {
    success: true,
    message: "Read Progress updated successfully",
    data: { ReadProgress, updatedBadge },
  };
};

export const getAllReadProgress = async (payload: any, user: any) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["userId", "bookId"]);

  (query as any).userId = user.id;

  if (payload.type === "finished") {
    (query as any).progress = 100;
  } else if (payload.type === "reading") {
    (query as any).progress = { $lt: 100 };
  }

  const totalDataCount = await readProgressModel.countDocuments(query);

  const results = await readProgressModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");

  return {
    page,
    limit,
    message: "Read Progress retrieved successfully",
    success: results.length > 0,
    total: totalDataCount,
    data: results,
  };
};
