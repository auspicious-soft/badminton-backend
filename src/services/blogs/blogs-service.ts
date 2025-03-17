import { queryBuilder } from "src/utils";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { httpStatusCode } from "src/lib/constant";
import { deleteFileFromS3 } from "src/config/s3";
import { Response } from "express";
import { blogsModel } from "../../models/blogs/blogs-schema";



export const createBlogService = async (payload: any, res: Response) => {
  const newBlog = new blogsModel(payload);
  const savedBlog = await newBlog.save();
  return {
    success: true,
    message: "Blog created successfully",
    data: savedBlog,
  };
};

export const getBlogService = async (id: string, res: Response) => {
  const blog = await blogsModel.findById(id);
  if (!blog)
    return errorResponseHandler(
      "Blog not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  return {
    success: true,
    message: "Blog retrieved successfully",
    data: blog,
  };
};

export const getAllBlogsService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["name"]);

  const totalDataCount =
    Object.keys(query).length < 1
      ? await blogsModel.countDocuments()
      : await blogsModel.countDocuments(query);
  const results = await blogsModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v");
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Blogs retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      success: false,
      total: 0,
    };
  }
};

export const updateBlogService = async (
  id: string,
  payload: any,
  res: Response
) => {
  const updatedBlog = await blogsModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedBlog)
    return errorResponseHandler(
      "Blog not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  return {
    success: true,
    message: "Blog updated successfully",
    data: updatedBlog,
  };
};

export const deleteBlogService = async (id: string, res: Response) => {
  const deletedBlog = await blogsModel.findByIdAndDelete(id);
  if (!deletedBlog)
    return errorResponseHandler(
      "Blog not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  if(deletedBlog?.image){
    await deleteFileFromS3(deletedBlog?.image)
  }
  return {
    success: true,
    message: "Blog deleted successfully",
    data: deletedBlog,
  };
};
