import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { nestedQueryBuilder, queryBuilder } from "src/utils";
import { bookMastersModel } from "../../models/book-masters/book-masters-schema";
import { productsModel } from "../../models/products/products-schema"; // Import productsModel
import { PipelineStage } from "mongoose";
import { favoritesModel } from "src/models/product-favorites/product-favorites-schema";
import { readProgressModel } from "src/models/user-reads/read-progress-schema";
import { getBookStudyCategoryService } from "../book-studies/book-studies-service";

export const addBooksToBookMaster = async (payload: any, res: Response) => {
  try {
    const createdDocuments = [];

    // Iterate over each productId and create a new document
    for (const productId of payload?.productsId) {
      const newDocument = await bookMastersModel.create({
        productsId: [productId], // Create a new document for each productId
      });
      createdDocuments.push(newDocument); // Store the created document
    }

    return {
      success: true,
      message: "Books added to bookMaster successfully",
      createdDocuments,
    }; // Return an array of created documents
  } catch (error) {
    console.error("Error adding books to bookMaster:", error);
    throw new Error("Failed to add books to bookMaster");
  }
};

export const getAvailableProductsService = async (res: Response) => {
  try {
    const bookMasters = await bookMastersModel.find().select("productsId");
    const bookMasterProductIds = bookMasters.flatMap((bookMaster) => bookMaster.productsId);

    const availableProducts = await productsModel.find({
      _id: { $nin: bookMasterProductIds },
      type: "course",
    });

    return {
      success: true,
      message: "Available products retrieved successfully",
      data: availableProducts,
    };
  } catch (error) {
    console.error("Error fetching available products:", error);
    throw new Error("Failed to fetch available products");
  }
};

export const getBookMasterService = async (id: string, res: Response) => {
  const bookMaster = await bookMastersModel.findById(id).populate({
    path: "productsId",
    populate: [{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }],
  });
  if (!bookMaster) return errorResponseHandler("Book master not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Book master retrieved successfully",
    data: bookMaster,
  };
};

export const getAllBookMastersService = async (payload: any) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const query: any = {};

  const sort: any = {};
  if (payload.orderColumn && payload.order) {
    sort[payload.orderColumn] = payload.order === "asc" ? 1 : -1;
  }

  const results = await bookMastersModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v")
    .populate({
      path: "productsId",
      populate: [{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }],
    })
    .lean();

  let filteredResults = results;
  let totalDataCount;
  totalDataCount = await bookMastersModel.countDocuments();
  if (payload.description) {
    const searchQuery = payload.description.toLowerCase();

    filteredResults = results.filter((book) => {
      const product = book.productsId as any;
      const authors = product?.authorId;
      const productNames = product?.name ? Object.values(product.name).map((val: any) => val.toLowerCase()) : [];

      const authorNames: string[] = (authors as any[]).flatMap((author) => (author && author.name ? Object.values(author.name).map((val: any) => val.toLowerCase()) : []));
      return productNames.some((name) => name.includes(searchQuery)) || authorNames.some((name) => name.includes(searchQuery));
    });
    totalDataCount = filteredResults.length;
  }
  return {
    page,
    limit,
    message: "Book masters retrieved successfully",
    success: filteredResults.length > 0,
    total: filteredResults.length > 0 ? totalDataCount : 0,
    data: filteredResults,
  };
};

export const updateBookMasterService = async (id: string, payload: any, res: Response) => {
  const updatedBookMaster = await bookMastersModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedBookMaster) return errorResponseHandler("Book master not found", httpStatusCode.NOT_FOUND, res);

  return {
    success: true,
    message: "Book master updated successfully",
    data: updatedBookMaster,
  };
};

export const deleteBookMasterService = async (id: string, res: Response) => {
  const deletedBookMaster = await bookMastersModel.findByIdAndDelete(id);
  if (!deletedBookMaster) return errorResponseHandler("Book master not found", httpStatusCode.NOT_FOUND, res);

  return {
    success: true,
    message: "Book master deleted successfully",
    data: deletedBookMaster,
  };
};
export const getBookMasterCategoryService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const bookStudy = await bookMastersModel.find().populate({
    path: "productsId",
    populate: [
      { path: "authorId" },
      { path: "categoryId" },
      { path: "subCategoryId" },
      { path: "publisherId" },
    ],
  });

  if (!bookStudy) {
    return errorResponseHandler("Book study not found", httpStatusCode.NOT_FOUND, res);
  }

  let categories: any[] = [];

  bookStudy.forEach((study:any) => {
    if (study.productsId && study.productsId.categoryId) {
      categories.push(...study.productsId.categoryId);
    }
  });

  const uniqueCategories = categories.filter((value, index, self) =>
    index === self.findIndex((t) => (
      t._id === value._id
    ))
  );

  return {
    success: true,
    message: "Book University categories retrieved successfully",
    data: { categories: uniqueCategories },
  };
};


export const getBookMasterTeacherService = async (payload: any, user: any, res: Response) => {
  const bookStudy = await bookMastersModel.find().populate({
    path: "productsId",
    populate: [
      { path: "authorId" },
      { path: "categoryId" },
      { path: "subCategoryId" },
      { path: "publisherId" },
    ],
  });

  if (!bookStudy) {
    return errorResponseHandler("Book study not found", httpStatusCode.NOT_FOUND, res);
  }

  let authors: any[] = [];

  bookStudy.forEach((study:any) => {
    if (study.productsId && !Array.isArray(study.productsId)) {
      if (study.productsId.authorId) {
        authors.push(study.productsId.authorId);
      }
    } else if (Array.isArray(study.productsId)) {
      study.productsId.forEach((product: any) => {
        if (product.authorId) {
          authors.push(product.authorId);
        }
      });
    }
  });

  authors = authors.flat();

  const uniqueAuthors = Array.from(
    new Map(
      authors
        .filter((author: any) => author && author._id)  // Filter out authors without _id
        .map((author: any) => [author._id.toString(), author])  // Map to _id
    ).values()
  );

  return {
    success: true,
    message: "Book Master Authors retrieved successfully",
    data: { teachers: uniqueAuthors },  
  };
};

export const getPopularCoursesBookMasterService = async (payload: any, user: any, res: Response) => {
  const bookStudy = await bookMastersModel.find()
  .populate({
    path: "productsId",
    match: { averageRating: { $gte: 4, $lte: 5 } }, 
    populate: [
      { path: "authorId" },
      { path: "categoryId" },
      { path: "subCategoryId" },
      { path: "publisherId" },
    ],
  })
  .sort({
    "productsId.averageRating": 1, 
  });
  const filteredBookStudy = bookStudy.filter((study) => study.productsId !== null);

  return {
    success: true,
    message: "Book Master Authors retrieved successfully",
    data: { popularCourses: filteredBookStudy },
  };
};

export const getBookMasterNewbookService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * 20;
  
  const today = new Date();
  
  const sixMonthsAgo = new Date(today.setMonth(today.getMonth() - 6));
  const totalDataCount = await bookMastersModel.countDocuments({
    createdAt: { $gte: sixMonthsAgo } 
  });
  
  const newBooks = await bookMastersModel.find({
    createdAt: { $gte: sixMonthsAgo } 
  })
    .populate({
      path: "productsId",
      populate: [
        { path: "authorId" },
        { path: "categoryId" },
        { path: "subCategoryId" },
        { path: "publisherId" },
      ],
    })
    .sort({ createdAt: -1 })  
    .skip(offset)
    .limit(limit);

  const favoriteBooks = await favoritesModel.find({ userId: user.id }).populate("productId");
  const favoriteIds = favoriteBooks
    .filter((book) => book.productId && book.productId._id) 
    .map((book) => book.productId._id.toString());

  const newBooksWithFavoriteStatus = newBooks.map((book) => ({
    ...book.toObject(),
    isFavorite: favoriteIds.includes(book._id.toString()), 
  }));

  return {
    success: true,
    message: "Books retrieved successfully",
    page,
    limit,
    total: totalDataCount,
    data: {
      newBooks: newBooksWithFavoriteStatus,
    },
  };
};
export const getBookMasterReadProgressService = async (user: any, payload: any, res: Response) => {
  const Books = await bookMastersModel.find({});
  const bookIds = Books.map(book => book.productsId);

  const readProgress = await readProgressModel.find({ 
    userId: user.id, 
    bookId: { $in: bookIds } 
  })
  .populate({
    path: "bookId",
    populate: [
      { path: "authorId" },
      { path: "categoryId" },
      { path: "subCategoryId" },
      { path: "publisherId" },
    ],
  });


  return {
    success: true,
    message: "Books retrieved successfully",
    data: {
      readBooks: readProgress,
    },
  };
};

export const getBookMastersForUserService = async (user: any, payload: any, res: Response) => {
  // const readProgress = await getBookMasterReadProgressService(user, payload, res);
  // const newBook = await getBookMasterNewbookService(user, payload, res);
  const teachers = await getBookMasterTeacherService(payload, user, res);
  const categories = await getBookMasterCategoryService(payload, user, res);
  const popularCourses = await getPopularCoursesBookMasterService(payload, user, res);

  return {
    success: true,
    message: "Book Master retrieved successfully",
    data: {
      // readBooks: readProgress.data.readBooks,
      // newBooks: newBook.data.newBooks,
      teachers: teachers.data.teachers,
      categories: categories?.data?.categories,
      popularCourses: popularCourses.data.popularCourses
    },
  };
};  