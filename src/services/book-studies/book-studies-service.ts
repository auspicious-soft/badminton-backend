import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { bookStudiesModel } from "../../models/book-studies/book-studies-schema"; // Import bookStudiesModel
import { productsModel } from "src/models/products/products-schema";
import { favoritesModel } from "src/models/product-favorites/product-favorites-schema";
import { readProgressModel } from "src/models/user-reads/read-progress-schema";


export const addBooksToBookStudy = async (payload: any, res: Response) => {
  try {
    const createdDocuments = [];

    // Iterate over each productId and create a new document
    for (const productId of payload?.productsId) {
      const newDocument = await bookStudiesModel.create({
        productsId: [productId], // Create a new document for each productId
      });
      createdDocuments.push(newDocument); // Store the created document
    }

    return {
      success: true,
      message: "Books added to bookMaster successfully",
      createdDocuments
    }; // Return an array of created documents
  } catch (error) {
    console.error("Error adding books to bookMaster:", error);
    throw new Error("Failed to add books to bookMaster");
  }
};

export const getAvailableProductsService = async (res: Response) => {
  try {
    const bookMasters = await bookStudiesModel.find().select("productsId");
    const bookMasterProductIds = bookMasters.flatMap(bookMaster => bookMaster.productsId);

    const availableProducts = await productsModel.find({
      _id: { $nin: bookMasterProductIds },
      type:"course"
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
export const getBookStudyService = async (id: string, res: Response) => {
  const bookStudy = await bookStudiesModel.findById(id).populate({
    path: "productsId",
    populate: [
      { path: "authorId" }, 
      { path: "categoryId" }, 
      { path: "subCategoryId" }, 
      { path: "publisherId" }, 
    ],
  });
  //nested populate
  if (!bookStudy) return errorResponseHandler("Book study not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Book study retrieved successfully",
    data: bookStudy,
  };
};


export const getAllBookStudiesService = async (payload: any) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const query: any = {}; 
  
  const sort: any = {};
  if (payload.orderColumn && payload.order) {
    sort[payload.orderColumn] = payload.order === "asc" ? 1 : -1;
  }
  

  const results = await bookStudiesModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v")
    .populate({
      path: "productsId",
      populate: [
        { path: "authorId" },
        { path: "categoryId" },
        { path: "subCategoryId" },
        { path: "publisherId" },
      ],
    })
    .lean();

    let filteredResults = results;
    let totalDataCount
    totalDataCount = await bookStudiesModel.countDocuments()
  if (payload.description) {
    const searchQuery = payload.description.toLowerCase();
    // totalDataCount = await bookMastersModel.countDocuments(query);

    filteredResults = results.filter((book) => {
      const product = book.productsId as any;
      const authors = product?.authorId;
      const productNames = product?.name
        ? Object.values(product.name).map((val: any) => val.toLowerCase())
        : [];

      const authorNames: string[] = (authors as any[]).flatMap((author) =>
        author && author.name ? Object.values(author.name).map((val: any) => val.toLowerCase()) : []
      );
      return (
        productNames.some((name) => name.includes(searchQuery)) ||
        authorNames.some((name) => name.includes(searchQuery))
      );
    })
    totalDataCount = filteredResults.length
  }
  return {
    page,
    limit,
    message: "Book studies retrieved successfully",
    success: filteredResults.length > 0,
    total: filteredResults.length > 0 ? totalDataCount : 0,
    data: filteredResults,
  };
};
export const updateBookStudyService = async (id: string, payload: any, res: Response) => {
  const updatedBookStudy = await bookStudiesModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedBookStudy) return errorResponseHandler("Book study not found", httpStatusCode.NOT_FOUND, res);
  
  return {    
    success: true,
    message: "Book study updated successfully",
    data: updatedBookStudy,
  };
};

export const deleteBookStudyService = async (id: string, res: Response) => {
  const deletedBookStudy = await bookStudiesModel.findByIdAndDelete(id);
  if (!deletedBookStudy) return errorResponseHandler("Book study not found", httpStatusCode.NOT_FOUND, res);
  
  return {
    success: true,
    message: "Book study deleted successfully",
    data: deletedBookStudy,
  };
};

// export const getBookStudyCategoryService = async (payload: any, user: any, res: Response) => {
//   const page = parseInt(payload.page as string) || 1;
//   const limit = parseInt(payload.limit as string) || 0;
//   const offset = (page - 1) * limit;

//   const bookStudy = await bookStudiesModel.find().populate({
//     path: "productsId",
//     populate: [
//       { path: "authorId" }, 
//       { path: "categoryId" }, 
//       { path: "subCategoryId" }, 
//       { path: "publisherId" },
//     ],
//   });
  
//   if (!bookStudy) {
//     return errorResponseHandler("Book study not found", httpStatusCode.NOT_FOUND, res);
//   }
  
//   let categories: any[] = [];
  
//   bookStudy.forEach((study) => {
//     if (study.productsId && !Array.isArray(study.productsId)) {
//       categories.push((study.productsId as any).categoryId);
//     } else if (Array.isArray(study.productsId)) {
//       categories.push(...study.productsId.map((product: any) => product.categoryId));
//     }
//   });

//   const uniqueCategories = [...new Set(categories)];

//   return {
//     success: true,
//     message: "Book study categories retrieved successfully",
//     data: { categories: uniqueCategories },  // Return the unique categories
//   };
// };
export const getBookStudyCategoryService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const bookStudy = await bookStudiesModel.find().populate({
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


export const getBookStudyTeacherService = async (payload: any, user: any, res: Response) => {
  const bookStudy = await bookStudiesModel.find().populate({
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
    message: "Book study Authors retrieved successfully",
    data: { teachers: uniqueAuthors },  
  };
};

export const getPopularCoursesService = async (payload: any, user: any, res: Response) => {
  const bookStudy = await bookStudiesModel.find()
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
    message: "Book study Authors retrieved successfully",
    data: { popularCourses: filteredBookStudy },
  };
};

export const getBookStudyNewbookForUserService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * 20;
  
  const today = new Date();
  
  const sixMonthsAgo = new Date(today.setMonth(today.getMonth() - 6));
  const totalDataCount = await bookStudiesModel.countDocuments({
    createdAt: { $gte: sixMonthsAgo } 
  });
  
  const newBooks = await bookStudiesModel.find({
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
export const getBookStudyReadProgressService = async (user: any, payload: any, res: Response) => {
  const Books = await bookStudiesModel.find({});
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

export const getBookStudyForUserService = async (user: any, payload: any, res: Response) => {
  const readProgress = await getBookStudyReadProgressService(user, payload, res);
  const newBook = await getBookStudyNewbookForUserService(user, payload, res);
  const teachers = await getBookStudyTeacherService(payload, user, res);
  const categories = await getBookStudyCategoryService(payload, user, res);
  const popularCourses = await getPopularCoursesService(payload, user, res);

  return {
    success: true,
    message: "Book study retrieved successfully",
    data: {
      readBooks: readProgress.data.readBooks,
      newBooks: newBook.data.newBooks,
      teachers: teachers.data.teachers,
      categories: categories.data.categories,
      popularCourses: popularCourses.data.popularCourses
    },
  };
};  