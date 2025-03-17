import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { nestedQueryBuilder, queryBuilder } from "src/utils";
import { deleteFileFromS3 } from "src/config/s3";
import { bookLivesModel } from "../../models/book-lives/book-lives-schema";
import { blogsModel } from "src/models/blogs/blogs-schema";

export const createBookLiveService = async (payload: any, res: Response) => {
  const newBookLive = new bookLivesModel(payload);
  const savedBookLive = await newBookLive.save();
  return {
    success: true,
    message: "Book live created successfully",
    data: savedBookLive,
  };
};

export const getBookLiveService = async (id: string, payload: any, res: Response) => {
  const bookLive = await bookLivesModel.findById(id);
  if (!bookLive) return errorResponseHandler("Book live not found", httpStatusCode.NOT_FOUND, res);

  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await blogsModel.countDocuments({ categoryId: id }) : await blogsModel.countDocuments({ ...query, categoryId: id });

  const blogs = await blogsModel
    .find({ ...query, categoryId: id })
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v");

  return {
    success: true,
    message: "Book live retrieved successfully",
    page,
    limit,
    total: totalDataCount,
    data: { bookLive, blogs },
  };
};

export const getAllBookLivesService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await bookLivesModel.countDocuments() : await bookLivesModel.countDocuments(query);
  const results = await bookLivesModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");
  if (results.length)
    return {
      success: true,
      message: "Book lives retrieved successfully",
      page,
      limit,
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      message: "No book lives found",
      page,
      limit,
      success: false,
      total: 0,
    };
  }
};

export const getAllBookLivesWithBlogsService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await bookLivesModel.countDocuments() : await bookLivesModel.countDocuments(query);

  const bookLivesResults = await bookLivesModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");

  if (!bookLivesResults.length) {
    return {
      data: [],
      message: "No book lives found",
      page,
      limit,
      success: false,
      total: 0,
    };
  }

  const bookLivesWithBlogs = await Promise.all(
    bookLivesResults.map(async (bookLife) => {
      const blogs = await blogsModel.find({ categoryId: bookLife._id }).select("-__v");
      return { ...bookLife.toObject(), blogs };
    })
  );

  return {
    success: true,
    message: "Book lives retrieved successfully",
    page,
    limit,
    total: totalDataCount,
    data: bookLivesWithBlogs,
  };
};

export const updateBookLiveService = async (id: string, payload: any, res: Response) => {
  const updatedBookLive = await bookLivesModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedBookLive) return errorResponseHandler("Book live not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Book live updated successfully",
    data: updatedBookLive,
  };
};

export const deleteBookLiveService = async (id: string, res: Response) => {
  const deletedBookLive = await bookLivesModel.findByIdAndDelete(id);
  if (!deletedBookLive) return errorResponseHandler("Book live not found", httpStatusCode.NOT_FOUND, res);
  if (deletedBookLive?.image) {
    await deleteFileFromS3(deletedBookLive?.image);
  }
  return {
    success: true,
    message: "Book live deleted successfully",
    data: deletedBookLive,
  };
};
