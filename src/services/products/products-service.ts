import { Response } from "express";
import mongoose from "mongoose";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { productsModel } from "../../models/products/products-schema";
import { filterBooksByLanguage, nestedQueryBuilder, queryBuilder, sortBooks, toArray } from "src/utils";
import { deleteFileFromS3 } from "src/config/s3";
import { productRatingsModel } from "src/models/ratings/ratings-schema";
import { ordersModel } from "src/models/orders/orders-schema";
import { favoritesModel } from "src/models/product-favorites/product-favorites-schema";
import { collectionsModel } from "src/models/collections/collections-schema";
import { categoriesModel } from "src/models/categories/categroies-schema";
import { readProgressModel } from "src/models/user-reads/read-progress-schema";
import { publishersModel } from "src/models/publishers/publishers-schema";
import { authorsModel } from "src/models/authors/authors-schema";
import { courseLessonsModel } from "src/models/course-lessons/course-lessons-schema";
import { usersModel } from "src/models/user/user-schema";

export const createBookService = async (payload: any, res: Response) => {
  const newBook = new productsModel(payload);
  const savedBook = await newBook.save();
  return {
    success: true,
    message: "Book created successfully",
    data: savedBook,
  };
};

export const getBooksService = async (payload: any, id: string, res: Response) => {
  try {
    const page = parseInt(payload.page as string) || 1;
    const limit = parseInt(payload.limit as string) || 0;
    const offset = (page - 1) * limit;
    let lessons, totalDataCount;
    const books = await productsModel.find({ _id: id }).populate([{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }]);
    if (!books || books.length === 0) {
      return errorResponseHandler("Book not found", httpStatusCode.NOT_FOUND, res);
    }
    if (books && books[0]?.type === "course") {
      totalDataCount = Object.keys({ productId: id }).length < 1 ? await courseLessonsModel.countDocuments() : await courseLessonsModel.countDocuments({ productId: id });
      lessons = await courseLessonsModel.find({ productId: id }).skip(offset).limit(limit).select("-__v");
    }
    const bookPrice = books[0]?.price;

    if (!bookPrice) {
      return errorResponseHandler("Book price not available", httpStatusCode.NOT_FOUND, res);
    }

    const orders = await ordersModel.find({ productIds: id });
    const totalBookSold = orders.length;
    const totalRevenue = totalBookSold * bookPrice;

    return {
      success: true,
      message: "Books retrieved successfully",
      data: {
        books,
        totalBookSold,
        totalRevenue,
        lessons: lessons ? lessons : [],
      },
      page,
      limit,
      total: totalDataCount,
    };
  } catch (error) {
    return errorResponseHandler("Failed to fetch books", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const getAllBooksService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const query: any = payload.type ? { type: payload.type } : {};
  console.log('query: ', query);

  const sort: any = {};
  if (payload.orderColumn && payload.order) {
    sort[payload.orderColumn] = payload.order === "asc" ? 1 : -1;
  }

  const results = await productsModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v")
    .populate([{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }])
    .lean();

  let filteredResults = results;
  let totalDataCount;
  totalDataCount = await productsModel.countDocuments(query);
  if (payload.description) {
    const searchQuery = payload.description.toLowerCase();

    filteredResults = results.filter((book) => {
      const product = book as any;
      const authors = book?.authorId;
      const productNames = product?.name ? Object.values(product.name).map((val: any) => val.toLowerCase()) : [];

      const authorNames: string[] = (authors as any[]).flatMap((author) => (author && author.name ? Object.values(author.name).map((val: any) => val.toLowerCase()) : []));
      return productNames.some((name) => name.includes(searchQuery)) || authorNames.some((name) => name.includes(searchQuery));
    });
    totalDataCount = filteredResults.length;
  }
  return {
    page,
    limit,
    message: "Books retrieved successfully",
    success: filteredResults.length > 0,
    total: filteredResults.length > 0 ? totalDataCount : 0,
    data: filteredResults,
  };
};
export const getAllProductsForStocksTabService = async (payload: any, res: Response) => {
  // const page = parseInt(payload.page as string) || 1;
  // const limit = parseInt(payload.limit as string) || 0;
  // const offset = (page - 1) * limit;

  const query: any = payload.type ? { type: payload.type } : {};

  const sort: any = {};
  if (payload.orderColumn && payload.order) {
    sort[payload.orderColumn] = payload.order === "asc" ? 1 : -1;
  }

  const Books = await productsModel
    .find({type:"e-book"})
    .sort(sort)
    // .skip(offset)
    .limit(1)
    .select("-__v")
    .populate([{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }])
    .lean();
  const Courses = await productsModel
    .find({type:"course"})
    .sort(sort)
    // .skip(offset)
    .limit(1)
    .select("-__v")
    .populate([{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }])
    .lean();

  // let filteredResults = results;
  let totalDataCount;
  totalDataCount = await productsModel.countDocuments(query);

  return {
    // page,
    // limit,
    message: "Stocks retrieved successfully",
    data:{Books,Courses},
    // success: filteredResults.length > 0,
    // total: filteredResults.length > 0 ? totalDataCount : 0,
    // data: filteredResults,
  };
};
export const getAllDiscountedBooksService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]) as { query: any; sort: any };

  if (payload.isDiscounted) {
    query.isDiscounted = payload.isDiscounted;
  }
  if (payload.type) {
    query.type = payload.type;
  }
  const totalDataCount = Object.keys(query).length < 1 ? await productsModel.countDocuments() : await productsModel.countDocuments(query);
  const results = await productsModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .populate([{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }]);
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Books retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      success: false,
      message: "No books found",
      total: 0,
    };
  }
};

export const getBookByIdService = async (id: string, res: Response) => {
  try {
    const book = await productsModel.findById(id);
    if (!book) return errorResponseHandler("Book not found", httpStatusCode.NOT_FOUND, res);
    return {
      success: true,
      message: "Book retrieved successfully",
      data: book,
    };
  } catch (error) {
    return errorResponseHandler("Failed to fetch book", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const updateBookService = async (id: string, payload: any, res: Response) => {
  try {
    const updatedBook = await productsModel.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedBook) return errorResponseHandler("Book not found", httpStatusCode.NOT_FOUND, res);
    return {
      success: true,
      message: "Book updated successfully",
      data: updatedBook,
    };
  } catch (error) {
    return errorResponseHandler("Failed to update book", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const addBookToDiscountsService = async (payload: any, res: Response) => {
  try {
    const { booksId, discountPercentage } = payload;
    const updatedBooks = await productsModel.updateMany(
      { _id: { $in: booksId } },
      {
        $set: {
          discountPercentage,
          isDiscounted: true,
        },
      }
    );

    if (updatedBooks.modifiedCount === 0) return errorResponseHandler("No books found to update", httpStatusCode.NOT_FOUND, res);

    return {
      success: true,
      message: "Books updated successfully",
      data: updatedBooks,
    };
  } catch (error) {
    console.error("Error updating books:", error); // Log the error for debugging
    return errorResponseHandler("Failed to update books", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const removeBookFromDiscountsService = async (payload: any, res: Response) => {
  try {
    const { booksId } = payload;

    const updatedBooks = await productsModel.updateMany(
      { _id: { $in: booksId } },
      {
        $set: {
          discountPercentage: null,
          isDiscounted: false,
        },
      }
    );

    if (updatedBooks.modifiedCount === 0) return errorResponseHandler("No books found to update", httpStatusCode.NOT_FOUND, res);

    return {
      success: true,
      message: "Books updated successfully",
      data: updatedBooks,
    };
  } catch (error) {
    console.error("Error updating books:", error); // Log the error for debugging
    return errorResponseHandler("Failed to update books", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};
export const deleteBookService = async (id: string, res: Response) => {
  try {
    const deletedBook = await productsModel.findByIdAndDelete(id);
    console.log("deletedBook: ", deletedBook);
    if (!deletedBook) return errorResponseHandler("Book not found", httpStatusCode.NOT_FOUND, res);
    if (deletedBook?.image) {
      await deleteFileFromS3(deletedBook.image);
    }
    if (deletedBook?.type === "course") {
      const courseLessons = await courseLessonsModel.find({ productId: deletedBook._id });

      // Extract all section files from each lesson
      const fileKeys = courseLessons.flatMap((lesson: any) => lesson.sections.flatMap((section: any) => section.file));

      // Delete each file from S3
      await Promise.all(
        fileKeys.filter(Boolean).map((filePath) => {
          deleteFileFromS3(filePath);
        })
      );

      await courseLessonsModel.deleteMany({ productId: deletedBook._id });
    }

    if (deletedBook?.file && deletedBook.file instanceof Map) {
      for (const key of deletedBook.file.keys()) {
        const fileValue = deletedBook.file.get(key);
        if (fileValue && typeof fileValue === "string") {
          await deleteFileFromS3(fileValue);
        }
      }
    }
    return {
      success: true,
      message: "Book deleted successfully",
      data: deletedBook,
    };
  } catch (error) {
    return errorResponseHandler("Failed to delete book", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

export const getProductsForHomePage = async () => {
  try {
    const books = await productsModel.find({ type: "e-book" }).limit(10);
    const courses = await productsModel.find({ type: "course" }).limit(10);

    return { books: books, courses: courses, success: true, message: "Products retrieved successfully" };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getBookForUserService = async (id: string, user: any, res: Response) => {
  const book = await productsModel.findById(id).populate([{ path: "authorId" }, { path: "categoryId" }, { path: "subCategoryId" }, { path: "publisherId" }]);

  const readers = await readProgressModel.countDocuments({ bookId: id });
  if (!book) {
    return errorResponseHandler("Book not found", httpStatusCode.NOT_FOUND, res);
  }
  const isFavorite = await favoritesModel.exists({ userId: user.id, productId: id });
  const relatedBooks = await productsModel.find({ categoryId: { $in: book?.categoryId } }).populate([{ path: "authorId" }]);
  const isPurchased = await ordersModel.find({ productIds: id, userId: user.id });

  return {
    success: true,
    message: "Book retrieved successfully",
    data: {
      book: {
        ...book.toObject(),
        // favorite: isFavorite ? true : false,
        readers: readers > 0 ? readers : 0,
      },
      relatedBooks: relatedBooks,
      isPurchased: isPurchased.length > 0 ? true : false,
      favorite: isFavorite ? true : false,
    },
  };
};

export const getNewbookForUserService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * 20;
  const totalDataCount = await productsModel.countDocuments({ type: "e-book" });
  const userData = await usersModel.findById(user.id);
  let newBooks = await productsModel
    .find({ type: "e-book" })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(20)
    .populate([
      { path: "authorId", select: "name" },
      { path: "categoryId", select: "name" },
    ]);
  const favoriteBooks = await favoritesModel.find({ userId: user.id }).populate("productId");
  const favoriteIds = favoriteBooks.filter((book) => book.productId && book.productId._id).map((book) => book.productId._id.toString());
  const languages = toArray(payload.language);
  newBooks = filterBooksByLanguage(newBooks, languages);
  newBooks = sortBooks(newBooks, payload.sorting, userData?.productsLanguage, userData?.language);

  const newBooksWithFavoriteStatus = newBooks.map((book) => ({
    ...book.toObject(),
    isFavorite: favoriteIds.includes(book._id.toString()),
  }));
  return {
    success: true,
    message: "Book retrieved successfully",
    page,
    limit,
    total: totalDataCount,
    data: {
      newBooks: newBooksWithFavoriteStatus,
    },
  };
};
export const getAllAudioBookForUserService = async (payload: any, user: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const userData = await usersModel.findById(user.id);
  let audiobooks = await productsModel
    .find({ type: "audiobook" })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate([
      { path: "authorId", select: "name" },
      { path: "categoryId", select: "name" },
    ]);
  const totalDataCount = await productsModel.countDocuments({ type: "audiobook" });

  const favoriteBooks = await favoritesModel.find({ userId: user.id }).populate("productId");
  const favoriteIds = favoriteBooks.filter((book) => book.productId && book.productId._id).map((book) => book.productId._id.toString());

  const languages = toArray(payload.language);
  audiobooks = filterBooksByLanguage(audiobooks, languages);
  audiobooks = sortBooks(audiobooks, payload.sorting, userData?.productsLanguage, userData?.language);
  const audiobooksWithFavoriteStatus = audiobooks.map((book) => ({
    ...book.toObject(),
    isFavorite: favoriteIds.includes(book._id.toString()),
  }));
  return {
    success: true,
    message: "Book retrieved successfully",
    page,
    limit,
    total: totalDataCount,
    data: {
      audioBooks: audiobooksWithFavoriteStatus,
    },
  };
};

export const getBookMarketForUserService = async (user: any, res: Response) => {
  const categories = await categoriesModel.find();
  const collections = await collectionsModel
    .find()
    .limit(5)
    .populate({
      path: "booksId",
      populate: [{ path: "authorId", select: "name" }],
    });
  const publisher = await publishersModel.find().limit(10);
  const author = await authorsModel.find().limit(10);
  const readProgress = await readProgressModel.find({ userId: user.id }).populate({
    path: "bookId",
    populate: [{ path: "authorId", select: "name" }],
  });
  const audiobooks = await productsModel.find({ type: "audiobook" }).populate([
    { path: "authorId", select: "name" },
    { path: "categoryId", select: "name" },
  ]);

  const bestSellers = await ordersModel.aggregate([
    {
      $unwind: "$productIds",
    },
    {
      $group: {
        _id: "$productIds",
        orderCount: { $sum: 1 },
      },
    },
    {
      $sort: { orderCount: -1 },
    },
    {
      $limit: 10,
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "book",
      },
    },
    {
      $unwind: "$book",
    },
    {
      $lookup: {
        from: "authors",
        localField: "book.authorId",
        foreignField: "_id",
        as: "book.authors",
      },
    },
    {
      $unwind: {
        path: "$book.authors",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        book: 1,
        orderCount: 1,
      },
    },
  ]);

  const newBooks = await productsModel
    .find({ type: "e-book" })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate([
      { path: "authorId", select: "name" },
      { path: "categoryId", select: "name" },
    ]);

  return {
    success: true,
    message: "Book retrieved successfully",
    data: {
      readProgress: readProgress,
      audiobooks: audiobooks,
      categories: categories,
      collections: collections,
      publisher: publisher,
      author: author,
      newBooks: newBooks,
      bestSellers: bestSellers,
    },
  };
};

export const getCourseForUserService = async (id: string, user: any, res: Response) => {
  const course = await productsModel
    .findById(id)
    .populate([{ path: "authorId" }, { path: "categoryId", select: "name" }, { path: "subCategoryId", select: "name" }, { path: "publisherId", select: "name" }]);

  const lessonCount = await courseLessonsModel.countDocuments({ productId: id, lang: "eng" });
  if (!course) {
    return errorResponseHandler("Book not found", httpStatusCode.NOT_FOUND, res);
  }
  const relatedCourses = await productsModel.find({ categoryId: { $in: course?.categoryId }, type: "course" }).populate([{ path: "authorId", select: "name" }]);
  const reviewCount = await productRatingsModel.countDocuments({ productId: id });
  const isFavorite = await favoritesModel.exists({ userId: user.id, productId: id });
  const isPurchased = await ordersModel.find({ productIds: id, userId: user.id });
  return {
    success: true,
    message: "Course retrieved successfully",
    data: {
      course: {
        ...course.toObject(),
        lessons: lessonCount > 0 ? lessonCount : 0,
      },
      reviewCount: reviewCount > 0 ? reviewCount : 0,
      relatedCourses: relatedCourses,
      isPurchased: isPurchased.length > 0 ? true : false,
      favorite: isFavorite ? true : false,
    },
  };
};
