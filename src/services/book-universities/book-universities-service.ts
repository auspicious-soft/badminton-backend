import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { bookUniversitiesModel } from "../../models/book-universities/book-universities-schema";
import { productsModel } from "src/models/products/products-schema";
import { favoritesModel } from "src/models/product-favorites/product-favorites-schema";
import { readProgressModel } from "src/models/user-reads/read-progress-schema";



export const addBooksToBookUniversity = async (payload: any, res: Response) => {
  try {
    const createdDocuments = [];

    // Iterate over each productId and create a new document
    for (const productId of payload?.productsId) {
      const newDocument = await bookUniversitiesModel.create({
        productsId: [productId], // Create a new document for each productId
      });
      createdDocuments.push(newDocument); // Store the created document
    }

    return {
      success: true,
      message: "Books added to Book University successfully",
      createdDocuments
    }; // Return an array of created documents
  } catch (error) {
    console.error("Error adding books to Book University:", error);
    throw new Error("Failed to add books to Book University");
  }
};

export const getAvailableProductsService = async (res: Response) => {
  try {
    const bookMasters = await bookUniversitiesModel.find().select("productsId");
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
export const getBookUniversityService = async (id: string, res: Response) => {
  const bookUniversity = await bookUniversitiesModel.findById(id).populate({
    path: "productsId",
    populate: [
      { path: "authorId" }, 
      { path: "categoryId" }, 
      { path: "subCategoryId" }, 
      { path: "publisherId" }, 
    ],
  });
  if (!bookUniversity) return errorResponseHandler("Book university not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Book university retrieved successfully",
    data: bookUniversity,
  };
};


export const getAllBookUniversitiesService = async (payload: any) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const query: any = {}; 
  
  const sort: any = {};
  if (payload.orderColumn && payload.order) {
    sort[payload.orderColumn] = payload.order === "asc" ? 1 : -1;
  }
  

  const results = await bookUniversitiesModel
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
    totalDataCount = await bookUniversitiesModel.countDocuments()
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
    message: "Book universities retrieved successfully",
    success: filteredResults.length > 0,
    total: filteredResults.length > 0 ? totalDataCount : 0,
    data: filteredResults,
  };
};

export const updateBookUniversityService = async (id: string, payload: any, res: Response) => {
  const updatedBookUniversity = await bookUniversitiesModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedBookUniversity) return errorResponseHandler("Book university not found", httpStatusCode.NOT_FOUND, res);
  
  return {    
    success: true,
    message: "Book university updated successfully",
    data: updatedBookUniversity,
  };
};

export const deleteBookUniversityService = async (id: string, res: Response) => {
  const deletedBookUniversity = await bookUniversitiesModel.findByIdAndDelete(id);
  if (!deletedBookUniversity) return errorResponseHandler("Book university not found", httpStatusCode.NOT_FOUND, res);
  
  return {
    success: true,
    message: "Book university deleted successfully",
    data: deletedBookUniversity,
  };
};

// export const getBookUniversityCategoryService = async (user: any, payload: any, res: Response) => {
//   const page = parseInt(payload.page as string) || 1;
//   const limit = parseInt(payload.limit as string) || 0;
//   const offset = (page - 1) * limit;

//   // Fetch book studies and populate with related fields
//   const bookStudy = await bookUniversitiesModel.find().populate({
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

//   // Log the fetched data for debugging
//   console.log("Fetched bookStudy data:", bookStudy);

//   // Iterate through each study to extract categories
//   bookStudy.forEach((study:any) => {
//     if (study.productsId && !Array.isArray(study.productsId)) {
//       // Handle single product (not an array)
//       if (study.productsId.categoryId) {
//         console.log("Single product categoryId:", study.productsId.categoryId);
//         categories.push(study.productsId.categoryId._id); // Push category _id into categories array
//       }
//     } else if (Array.isArray(study.productsId)) {
//       // Handle array of products
//       study.productsId.forEach((product: any) => {
//         if (product.categoryId) {
//           console.log("Product categoryId:", product.categoryId);
//           categories.push(product.categoryId._id); // Push category _id into categories array
//         }
//       });
//     }
//   });

//   // Log the raw categories array before removing duplicates
//   console.log("Raw categories array:", categories);

//   // Remove duplicate category _ids using Set
//   const uniqueCategoryIds = Array.from(new Set(categories));
//   console.log("Unique categoryIds:", uniqueCategoryIds);

//   // Map unique category _ids to category objects
//   const uniqueCategories = uniqueCategoryIds.map((id) => {
//     return bookStudy
//       .map((study:any) => {
//         // Look for the category that matches the _id
//         const matchingCategory = (study?.productsId)?.find((product: any) => product.categoryId?._id.toString() === id.toString());
//         return matchingCategory ? matchingCategory.categoryId : null;
//       })
//       .find((category) => category); // Get the first valid category (non-null)
//   }).filter(Boolean); // Remove null values

//   // Log the final result of unique categories
//   console.log("Final unique categories:", uniqueCategories);

//   return {
//     success: true,
//     message: "Book University categories retrieved successfully",
//     data: { categories: uniqueCategories },
//   };
// };




export const getBookUniversityCategoryService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;

  const bookStudy = await bookUniversitiesModel.find().populate({
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



// export const getBookUniversityCategoryService = async (user: any, payload: any, res: Response) => {
//   const page = parseInt(payload.page as string) || 1;
//   const limit = parseInt(payload.limit as string) || 0;
//   const offset = (page - 1) * limit;

//   const bookStudy = await bookUniversitiesModel.find().populate({
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
//     message: "Book University categories retrieved successfully",
//     data: { categories: uniqueCategories },  
//   };
// };


export const getBookUniversityTeacherService = async (payload: any, user: any, res: Response) => {
  const bookStudy = await bookUniversitiesModel.find().populate({
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
    message: "Book University Authors retrieved successfully",
    data: { teachers: uniqueAuthors },  
  };
};

export const getPopularCoursesBookUniversityService = async (payload: any, user: any, res: Response) => {
  const bookStudy = await bookUniversitiesModel.find()
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

export const getBookUniversityNewbookService = async (user: any, payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * 20;
  
  const today = new Date();
  
  const sixMonthsAgo = new Date(today.setMonth(today.getMonth() - 6));
  const totalDataCount = await bookUniversitiesModel.countDocuments({
    createdAt: { $gte: sixMonthsAgo } 
  });
  
  const newBooks = await bookUniversitiesModel.find({
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
export const getBookUniversityReadProgressService = async (user: any, payload: any, res: Response) => {
  const Books = await bookUniversitiesModel.find({});
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

export const getBookUniversityForUserService = async (user: any, payload: any, res: Response) => {
  const readProgress = await getBookUniversityReadProgressService(user, payload, res);
  const newBook = await getBookUniversityNewbookService(user, payload, res);
  const teachers = await getBookUniversityTeacherService(payload, user, res);
  const categories = await getBookUniversityCategoryService(payload, user, res);
  const popularCourses = await getPopularCoursesBookUniversityService(payload, user, res);

  return {
    success: true,
    message: "Book Master retrieved successfully",
    data: {
      readBooks: readProgress.data.readBooks,
      newBooks: newBook.data.newBooks,
      teachers: teachers.data.teachers,
      categories: categories?.data?.categories,
      popularCourses: popularCourses.data.popularCourses
    },
  };
};  