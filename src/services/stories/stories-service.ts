import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { nestedQueryBuilder, queryBuilder } from "src/utils";
import { storiesModel } from "../../models/stories/stories-schema";
import { deleteFileFromS3 } from "src/config/s3";


export const createStoryService = async (payload: any, res: Response) => {
  const newStory = new storiesModel(payload);
  const savedStory = await newStory.save();
  return {
    success: true,
    message: "Story created successfully",
    data: savedStory,
  };
};

export const getStoryService = async (id: string, res: Response) => {
  const story = await storiesModel.findById(id);
  if (!story) return errorResponseHandler("Story not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Story retrieved successfully",
    data: story,
  };
};

export const getAllStoriesService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await storiesModel.countDocuments() : await storiesModel.countDocuments(query);
  const results = await storiesModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Stories retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      message: "No stories found",
      success: false,
      total: 0,
    };
  }
};

export const updateStoryService = async (id: string, payload: any, res: Response) => {
  const updatedStory = await storiesModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedStory) return errorResponseHandler("Story not found", httpStatusCode.NOT_FOUND, res);
  return {    
    success: true,
    message: "Story updated successfully",
    data: updatedStory,
  };
};

export const deleteStoryService = async (id: string, res: Response) => {
  const deletedStory = await storiesModel.findByIdAndDelete(id);
  if (!deletedStory) return errorResponseHandler("Story not found", httpStatusCode.NOT_FOUND, res);
  const fileKeys = Object.keys(deletedStory.file);

  // Pass the keys to deleteFileFromS3
  for (const key of fileKeys) {
    await deleteFileFromS3(key);
  }
  return {
    success: true,
    message: "Story deleted successfully",
    data: deletedStory,
  };
};
