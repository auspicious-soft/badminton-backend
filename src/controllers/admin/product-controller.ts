import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { productModel } from "src/models/admin/products-schema";
import { venueModel } from "src/models/venue/venue-schema";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { inventoryModel } from "src/models/admin/inventory-schema";

export const createProduct = async (req: Request, res: Response) => {
  try {
    const payload = req?.body;
    console.log("payload: ", payload);
    if (!payload) {
      return errorResponseHandler(
        "Payload is missing",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const requiredFields = [
      "productName",
      "description",
      "specification",
      "primaryImage",
      "thumbnails",
      "actualPrice",
      "discountedPrice",
      "venueAndQuantity",
    ];

    const missingFields = requiredFields.filter((field) => !payload[field]);

    if (missingFields.length > 0) {
      return errorResponseHandler(
        `Missing required fields: ${missingFields.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate price values
    if (payload?.actualPrice <= 0 || payload?.discountedPrice <= 0) {
      return errorResponseHandler(
        "Prices must be greater than zero",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (payload.discountedPrice > payload.actualPrice) {
      return errorResponseHandler(
        "Discounted price cannot be greater than actual price",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate venues and quantities
    if (
      !Array.isArray(payload.venueAndQuantity) ||
      payload.venueAndQuantity.length === 0
    ) {
      return errorResponseHandler(
        "At least one venue with quantity is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate each venue ID and quantity
    for (const item of payload.venueAndQuantity) {
      if (!item.venueId || !mongoose.Types.ObjectId.isValid(item.venueId)) {
        return errorResponseHandler(
          "Invalid venue ID format",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      // Check if venue exists
      const venueExists = await venueModel.findById(item.venueId);
      if (!venueExists) {
        return errorResponseHandler(
          `Venue with ID ${item.venueId} not found`,
          httpStatusCode.NOT_FOUND,
          res
        );
      }

      if (typeof item.quantity !== "number" || item.quantity < 0) {
        return errorResponseHandler(
          "Quantity must be a non-negative number",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }

    // Create the product
    const newProduct = await productModel.create({
      productName: payload.productName,
      description: payload.description,
      specification: payload.specification,
      primaryImage: payload.primaryImage,
      thumbnails: payload.thumbnails,
      actualPrice: payload.actualPrice,
      discountedPrice: payload.discountedPrice,
      venueAndQuantity: payload.venueAndQuantity,
      category: payload.category || null,
      subCategory: payload.subCategory || null,
      tags: payload.tags || [],
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      reviews: [],
      averageRating: 0,
      totalReviews: 0,
    });

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Product created successfully",
      data: newProduct,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, page, limit } = req.query;
    const pageNumber = parseInt(page as string) || 1;
    const limitNumber = parseInt(limit as string) || 10;
    const offset = (pageNumber - 1) * limitNumber;

    const searchQuery = search
      ? {
          $or: [
            { productName: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
            { specification: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const totalProducts = await productModel.countDocuments(searchQuery);

    // Use populate to get venue details
    const products = await productModel
      .find(searchQuery)
      .populate("venueAndQuantity.venueId", "name address") // Populate venue details
      .skip(offset)
      .limit(limitNumber)
      .sort({ createdAt: -1 })
      .lean();

    // Transform the response to include venue name directly in venueAndQuantity
    const transformedProducts = products.map((product) => {
      const transformedProduct = { ...product };

      // Transform venueAndQuantity to include venue name
      if (transformedProduct.venueAndQuantity) {
        transformedProduct.venueAndQuantity =
          transformedProduct.venueAndQuantity.map((item) => {
            if (item.venueId) {
              // Extract venue details
              const venueDetails =
                typeof item.venueId === "object" ? item.venueId : null;

              return {
                venueId: venueDetails?._id || item.venueId,
                quantity: item.quantity,
                venueName:
                  venueDetails && "name" in venueDetails
                    ? String(venueDetails.name)
                    : "Unknown Venue",
                venueLocation:
                  venueDetails &&
                  typeof venueDetails === "object" &&
                  "address" in venueDetails
                    ? String(venueDetails.address)
                    : "Unknown Location",
              };
            }
            return item;
          });
      }

      // Add soldThisMonth field with dummy data
      (transformedProduct as any).soldThisMonth = 50;

      return transformedProduct;
    });

    const venues = await venueModel
      .find({ isActive: true })
      .lean()
      .select("_id name");

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Products retrieved successfully",
      data: transformedProducts,
      venues,
      meta: {
        total: totalProducts,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: offset + limitNumber < totalProducts,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalProducts / limitNumber),
      },
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    if (!id) {
      return errorResponseHandler(
        "Product ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const product = await productModel.findById(id);
    if (!product) {
      return errorResponseHandler(
        "Product not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    const updatedProduct = await productModel.findByIdAndUpdate(id, payload, {
      new: true,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Convert query params to numbers
    const pageNumber = parseInt(page as string) || 1;
    const limitNumber = parseInt(limit as string) || 10;

    if (!id) {
      return errorResponseHandler(
        "Product ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Find the product with populated venue information
    const product = await productModel
      .findById(id)
      .populate("venueAndQuantity.venueId", "name address");

    if (!product) {
      return errorResponseHandler(
        "Product not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Convert to plain object for manipulation
    const productObj = product.toObject();

    // Transform venueAndQuantity to include venue name and address
    if (productObj.venueAndQuantity) {
      productObj.venueAndQuantity = productObj.venueAndQuantity.map(
        (item: any) => {
          if (item.venueId) {
            // Extract venue details
            const venueDetails =
              typeof item.venueId === "object" ? item.venueId : null;

            return {
              venueId: venueDetails?._id || item.venueId,
              quantity: item.quantity,
              venueName:
                venueDetails && "name" in venueDetails
                  ? String(venueDetails.name)
                  : "Unknown Venue",
              venueLocation:
                venueDetails &&
                typeof venueDetails === "object" &&
                "address" in venueDetails
                  ? String(venueDetails.address)
                  : "Unknown Location",
            };
          }
          return item;
        }
      );
    }

    // Get total reviews count
    const totalReviews = productObj.reviews?.length || 0;

    // Paginate reviews
    const startIndex = (pageNumber - 1) * limitNumber;
    const endIndex = pageNumber * limitNumber;

    // Extract paginated reviews
    const paginatedReviews =
      productObj.reviews?.slice(startIndex, endIndex) || [];

    // Replace full reviews array with paginated reviews
    productObj.reviews = paginatedReviews;

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Product retrieved successfully",
      data: productObj,
      meta: {
        reviews: {
          total: totalReviews,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(totalReviews / limitNumber),
          hasNextPage: endIndex < totalReviews,
          hasPreviousPage: startIndex > 0,
        },
      },
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const addQuantityToProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { venueId, quantity } = req.body;

    if (!id) {
      return errorResponseHandler(
        "Product ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!venueId) {
      return errorResponseHandler(
        "Venue ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (typeof quantity !== "number" || quantity < 0) {
      return errorResponseHandler(
        "Quantity must be a non-negative number",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const product = await productModel.findById(id);
    if (!product) {
      return errorResponseHandler(
        "Product not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const existingVenue = product.venueAndQuantity.find(
      (item) => item.venueId.toString() === venueId.toString()
    );

    if (existingVenue) {
      existingVenue.quantity = quantity; // Replace with new quantity
    } else {
      product.venueAndQuantity.push({ venueId, quantity });
    }

    await product.save();

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Quantity updated successfully",
      data: product,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getInventory = async (req: Request, res: Response) => {
  try {
    const { venueId } = req.query;
    if (!venueId) {
      errorResponseHandler(
        "Venue ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const inventory = await inventoryModel.find({ venueId }).lean();
    const venues = await venueModel
      .find({ isActive: true })
      .lean()
      .select("_id name");

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Inventory retrieved successfully",
      data: { inventory, venues },
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const createInventory = async (req: Request, res: Response) => {
  try {
    const inventoryData = req.body;
    if (!inventoryData || inventoryData.length === 0) {
      return errorResponseHandler(
        "Payload is missing",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if inventoryData is an array
    if (!Array.isArray(inventoryData)) {
      return errorResponseHandler(
        "Inventory data must be an array",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate each item in the array
    for (const item of inventoryData) {
      if (!item.venueId) {
        return errorResponseHandler(
          "Venue ID is required for all items",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }

    const data = await inventoryModel.insertMany(inventoryData);

    return res.status(httpStatusCode.CREATED).json({
      success: true,
      message: "Inventory created successfully",
      data: data,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
