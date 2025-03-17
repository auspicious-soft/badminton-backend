import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { categoriesModel } from "../../models/categories/categroies-schema";
import { subCategoriesModel } from "src/models/sub-categories/sub-categories-schema";
import { productsModel } from "src/models/products/products-schema";
import { applyFilters, filterBooksByLanguage, nestedQueryBuilder, queryBuilder, sortBooks, sortByLanguagePriority, toArray } from "src/utils";
import { deleteFileFromS3 } from "src/config/s3";
import { favoritesModel } from "src/models/product-favorites/product-favorites-schema";
import { usersModel } from "src/models/user/user-schema";

export const createCategoryService = async (payload: any, res: Response) => {
  const newCategory = new categoriesModel(payload);
  const savedCategory = await newCategory.save();
  return {
    success: true,
    message: "Category created successfully",
    data: savedCategory,
  };
};

export const getCategoryService = async (id: string, res: Response) => {
  const category = await categoriesModel.findById(id);
  if (!category) return errorResponseHandler("Category not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Category retrieved successfully",
    data: category,
  };
};

export const getBooksByCategoryIdService = async (id: string, user: any, payload: any, res: Response) => {
  const userData = await usersModel.findById(user.id);
  const category = await categoriesModel.findById(id);
  if (!category) return errorResponseHandler("Category not found", httpStatusCode.NOT_FOUND, res);

  const favoriteBooks = await favoritesModel.find({ userId: user.id }).populate("productId");
  const favoriteIds = favoriteBooks.map((book) => book.productId?._id.toString());

  const categoryBooks = await productsModel.find({ categoryId: id }).populate([
    { path: "authorId", select: "name" },
    { path: "categoryId", select: "name" },
    { path: "publisherId", select: "name" },
  ]);

  let categoryBooksWithFavoriteStatus = categoryBooks.map((book) => ({
    ...book.toObject(),
    isFavorite: favoriteIds.includes(book._id.toString()), // Check if the book is in the user's favorites
  }));
  const languages = toArray(payload.language);
  categoryBooksWithFavoriteStatus = filterBooksByLanguage(categoryBooksWithFavoriteStatus, languages);

  if (!categoryBooksWithFavoriteStatus.length) {
    return errorResponseHandler("No books found for the selected languages", httpStatusCode.NO_CONTENT, res);
  }

  // ✅ Apply Sorting Based on Payload.sorting
  categoryBooksWithFavoriteStatus = sortBooks(categoryBooksWithFavoriteStatus, payload.sorting, userData?.productsLanguage, userData?.language);
  // sortByLanguagePriority(categoryBooksWithFavoriteStatus, "file", userData?.productsLanguage || []);


  return {
    success: true,
    message: "Category retrieved successfully",
    data: { category, books: categoryBooksWithFavoriteStatus },
  };
};

// export const getBooksByCategoryIdService = async (id: string, user: any, query: any, res: Response,) => {
//   const { language = 'eng', minRating = 0, sortBy = 'createdAt', sortOrder = 'desc' } = query;

//   const category = await categoriesModel.findById(id);
//   if (!category) return errorResponseHandler("Category not found", httpStatusCode.NOT_FOUND, res);

//   // Get the user's favorite books and their IDs
//   const favoriteBooks = await favoritesModel.find({ userId: user.id }).populate("productId");
//   const favoriteIds = favoriteBooks.map((book) => book.productId._id.toString());

//   // Fetch books by category and populate necessary fields
//   const categoryBooks = await productsModel.find({ categoryId: id }).populate([
//     { path: "authorId", select: "name" },
//     { path: "categoryId", select: "name" },
//     { path: "publisherId", select: "name" },
//   ]);

//   // Map the books and add the 'isFavorite' status
//   const categoryBooksWithFavoriteStatus = categoryBooks.map((book) => ({
//     ...book.toObject(),
//     isFavorite: favoriteIds.includes(book._id.toString()), // Check if the book is in the user's favorites
//   }));

//   // Apply filters:

//   let filteredBooks = categoryBooksWithFavoriteStatus;

//   // 1. Filter by minimum average rating (if provided in the query)
//   filteredBooks = filteredBooks.filter((book) => book.averageRating >= parseFloat(minRating));

//   // 2. Alphabetical order of book name based on the chosen language (default 'eng')
//   filteredBooks = filteredBooks.sort((a, b) => {
//     const nameA = a.name[language] || a.name['eng']; // Default to 'eng' if specific language is unavailable
//     const nameB = b.name[language] || b.name['eng'];
//     return nameA.localeCompare(nameB);
//   });

//   // 3. Newest first (createdAt) or another field (if `sortBy` is specified in the query)
//   filteredBooks = filteredBooks.sort((a, b) => {
//     const dateA = new Date(a[sortBy]).getTime();
//     const dateB = new Date(b[sortBy]).getTime();
//     return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
//   });

//   // 4. If you want to filter based on language availability in name
//   if (language !== 'eng') {
//     filteredBooks = filteredBooks.filter((book) => book.name[language]); // Filter out books that don't have the required language name
//   }

//   return {
//     success: true,
//     message: "Category retrieved successfully",
//     data: { category, books: filteredBooks },
//   };
// };

export const getAllCategoriesService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await categoriesModel.countDocuments() : await categoriesModel.countDocuments(query);
  const results = await categoriesModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v");
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Categories retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      message: "No categories found",
      success: false,
      total: 0,
    };
  }
};

export const updateCategoryService = async (id: string, payload: any, res: Response) => {
  const updatedCategory = await categoriesModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedCategory) return errorResponseHandler("Category not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Category updated successfully",
    data: updatedCategory,
  };
};

export const deleteCategoryService = async (id: string, res: Response) => {
  const subCategories = await subCategoriesModel.find({ categoryId: id });
  const books = await productsModel.find({ categoryId: id });
  if (subCategories.length > 0) {
    return errorResponseHandler("Cannot delete category with existing sub-categories", httpStatusCode.BAD_REQUEST, res);
  }
  if (books.length > 0) {
    return errorResponseHandler("Cannot delete category with existing books", httpStatusCode.BAD_REQUEST, res);
  }
  const deletedCategory = await categoriesModel.findByIdAndDelete(id);
  if (!deletedCategory) return errorResponseHandler("Category not found", httpStatusCode.NOT_FOUND, res);
  if (deletedCategory?.image) {
    await deleteFileFromS3(deletedCategory?.image);
  }
  return {
    success: true,
    message: "Category deleted successfully",
    data: deletedCategory,
  };
};

export const addBookToCategoryService = async (payload: any, id: string, res: Response) => {
  try {
    const { booksId } = payload;

    const updatedBooks = await productsModel.updateMany(
      { _id: { $in: booksId } },
      {
        $addToSet: {
          categoryId: id,
        },
      }
    );

    if (updatedBooks.modifiedCount === 0) return errorResponseHandler("No books found to update", httpStatusCode.NOT_FOUND, res);

    return {
      success: true,
      message: "Books Added to Category successfully",
      data: updatedBooks,
    };
  } catch (error) {
    console.error("Error updating books:", error); // Log the error for debugging
    return errorResponseHandler("Failed to update books", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};
