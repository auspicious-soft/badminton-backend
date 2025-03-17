import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { filterBooksByLanguage, nestedQueryBuilder, queryBuilder, sortBooks, sortByLanguagePriority, toArray } from "src/utils";
import { deleteFileFromS3 } from "src/config/s3";
import { collectionsModel } from "../../models/collections/collections-schema";
import { favoritesModel } from "src/models/product-favorites/product-favorites-schema";
import { productsModel } from "src/models/products/products-schema";
import { usersModel } from "src/models/user/user-schema";


export const createCollectionService = async (payload: any, res: Response) => {
  const newCollection = new collectionsModel(payload);
  const savedCollection = await newCollection.save();
  return {
    success: true,
    message: "Collection created successfully",
    data: savedCollection,
  };
};


export const getCollectionService = async (id: string, res: Response) => {
  const collection = await collectionsModel.findById(id).populate({
    path: "booksId",
    populate: [
      { path: "authorId" }, 
      { path: "categoryId" }, 
      { path: "subCategoryId" }, 
      { path: "publisherId" }, 
    ],
  });;
  if (!collection) return errorResponseHandler("Collection not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Collection retrieved successfully",
    data: collection,
  };
};

export const getCollectionForUserService = async (payload:any, user: any, id: string, res: Response) => {
  const userData = await usersModel.findById(user.id);
  const collection = await collectionsModel.findById(id).populate({
    path: "booksId",
    populate: [
      { path: "authorId" }, 
      { path: "categoryId" }, 
      { path: "subCategoryId" }, 
      { path: "publisherId" }, 
    ],
  });

  // If collection is not found, return an error response
  if (!collection) return errorResponseHandler("Collection not found", httpStatusCode.NOT_FOUND, res);

  // Find the user's favorite books
  const favoriteBooks = await favoritesModel.find({ userId: user.id }).populate("productId");

  // Safe check to ensure each favorite book has a valid productId and productId._id
  const favoriteIds = favoriteBooks
    .filter((book) => book.productId && book.productId._id)  // Ensure valid productId and _id
    .map((book) => book.productId._id.toString());

  // Check if booksId exists and is an array, then map through it
  if (!collection.booksId || !Array.isArray(collection.booksId)) {
    return errorResponseHandler("Invalid books data in the collection", httpStatusCode.BAD_REQUEST, res);
  }

  // Map through the books in the collection and add the isFavorite field
  let updatedBooks = collection.booksId.map((book: any) => {
    if (!book || !book._id) {
      return null; // Skip invalid or incomplete book objects
    }
    
    return {
      ...book.toObject(),  // Convert mongoose object to plain JS object
      isFavorite: favoriteIds.includes(book._id.toString()),  // Check if the book is in the user's favorites
    };
  }).filter((book) => book !== null); // Remove any null values from the mapped array
    const languages = toArray(payload.language);
    updatedBooks = filterBooksByLanguage(updatedBooks, languages);
    updatedBooks = sortBooks(updatedBooks, payload.sorting, userData?.productsLanguage, userData?.language);

    // const audiobooksWithFavoriteStatus = updatedBooks.map((book) => ({
    //   ...book.toObject(),
    //   isFavorite: favoriteIds.includes(book._id.toString()),
    // }));
  // sortByLanguagePriority(updatedBooks, "file", userData?.productsLanguage || []);

  // Return the updated collection data with the favorite status added to each book
  return {
    success: true,
    message: "Collection retrieved successfully",
    data: {
      ...collection.toObject(),
      booksId: updatedBooks,  // Replace the booksId with the updated books
    },
  };
};



export const getAllCollectionsService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = nestedQueryBuilder(payload, ["name"]);

  const totalDataCount = Object.keys(query).length < 1 ? await collectionsModel.countDocuments() : await collectionsModel.countDocuments(query);
  const results = await collectionsModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v").populate({
    path: "booksId",
    populate: [
      { path: "authorId",select: "name" }, 
      { path: "categoryId",select: "name" }, 
      { path: "subCategoryId",select: "name" }, 
      { path: "publisherId",select: "name" }, 
    ],
  });
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Collections retrieved successfully",
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

export const updateCollectionService = async (id: string, payload: any, res: Response) => {
  const updatedCollection = await collectionsModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedCollection) return errorResponseHandler("Collection not found", httpStatusCode.NOT_FOUND, res);
  
  return {    
    success: true,
    message: "Collection updated successfully",
    data: updatedCollection,
  };
};
export const addBooksToCollectionService = async (id: string, payload: any, res: Response) => {
  const updatedCollection = await collectionsModel.findByIdAndUpdate(
    id,
    { $addToSet: { booksId: { $each: payload.booksId } } },
    { new: true }
  );
  if (!updatedCollection) return errorResponseHandler("Collection not found", httpStatusCode.NOT_FOUND, res);
  
  return {    
    success: true,
    message: "Collection updated successfully",
    data: updatedCollection,
  };
};

export const deleteCollectionService = async (id: string, res: Response) => {
  const deletedCollection = await collectionsModel.findByIdAndDelete(id);
  if (!deletedCollection) return errorResponseHandler("Collection not found", httpStatusCode.NOT_FOUND, res);
  if (deletedCollection?.image) {
      await deleteFileFromS3(deletedCollection.image);
  }
  return {
    success: true,
    message: "Collection deleted successfully",
    data: deletedCollection,
  };
};

