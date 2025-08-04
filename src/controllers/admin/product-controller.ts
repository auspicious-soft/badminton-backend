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
import { orderModel } from "src/models/admin/order-schema";
import { usersModel } from "src/models/user/user-schema";
import PDFDocument from "pdfkit"; // Correct import
import { PassThrough } from "stream";
import path from "path";
import fs from "fs";

export const createProduct = async (req: Request, res: Response) => {
  try {
    const payload = req?.body;
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
    const transformedProducts = await Promise.all(
      products.map(async (product) => {
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
        (transformedProduct as any).soldThisMonth = await orderModel
          .aggregate([
            {
              $match: {
                paymentStatus: "paid",
                createdAt: {
                  $gte: new Date(new Date().setDate(1)), // First day of current month
                  $lte: new Date(), // Current date
                },
              },
            },
            { $unwind: "$items" },
            {
              $match: {
                "items.productId": product._id,
              },
            },
            {
              $group: {
                _id: null,
                totalSold: { $sum: "$items.quantity" },
              },
            },
          ])
          .then((result) => result[0]?.totalSold || 0);

        return transformedProduct;
      })
    );

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
    const { venueId, page, limit, search } = req.query;

    // Parse pagination parameters
    const pageNumber = parseInt(page as string) || 1;
    const limitNumber = parseInt(limit as string) || 10;
    const offset = (pageNumber - 1) * limitNumber;

    // Build query
    let query: any = {};
    query.isActive = true;

    // Add venueId filter if provided
    if (venueId) {
      query.venueId = venueId;
    }

    // Add search filter if provided
    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    // Count total documents for pagination
    const totalInventory = await inventoryModel.countDocuments(query);

    // Get paginated inventory
    const inventory = await inventoryModel
      .find(query)
      .skip(offset)
      .limit(limitNumber)
      .sort({ createdAt: -1 })
      .populate({ path: "venueId", select: "name" })
      .lean();

    // Get venues for dropdown
    const venues = await venueModel
      .find({ isActive: true })
      .lean()
      .select("_id name");

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Inventory retrieved successfully",
      data: { inventory, venues },
      meta: {
        total: totalInventory,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: offset + limitNumber < totalInventory,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalInventory / limitNumber),
      },
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

export const deleteInventory = async (req: Request, res: Response) => {
  try {
    let { id } = req.query;

    if (!id) {
      return errorResponseHandler(
        "Inventory ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const checkExist = await inventoryModel.findOne({
      _id: id,
      isActive: true,
    });

    if (!checkExist) {
      return errorResponseHandler(
        "Inventory not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    await inventoryModel.findByIdAndUpdate(id, { isActive: false });

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Inventory deleted successfully",
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateInventory = async (req: Request, res: Response) => {
  try {
    let { inventoryId, type, quantity } = req.body;

    quantity = Number(quantity);
    // Ensure quantity is not negative
    quantity = Math.max(0, quantity);

    if (type !== "inStock" && type !== "inUse") {
      return errorResponseHandler(
        "Type must be either inStock or inUse",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!inventoryId) {
      return errorResponseHandler(
        "Inventory ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const checkExist = await inventoryModel.findOne({
      _id: inventoryId,
      isActive: true,
    });

    if (!checkExist) {
      return errorResponseHandler(
        "Inventory not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    let response;

    if (type === "inUse") {
      let inStock = Number(checkExist?.inStock || 0);

      if (quantity > checkExist.isUse) {
        // Calculate how many more items are being used
        const additionalUsed = quantity - checkExist.isUse;

        // Check if there's enough stock
        if (inStock < additionalUsed) {
          return errorResponseHandler(
            `Not enough items in stock. Available: ${inStock}, Required: ${additionalUsed}`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        response = await inventoryModel.findByIdAndUpdate(
          inventoryId,
          {
            inStock: inStock - additionalUsed,
            isUse: quantity,
          },
          { new: true }
        );
      } else {
        // Calculate how many items are being returned to stock
        const returnedToStock = checkExist.isUse - quantity;
        // Add returned items to inStock
        const newInStock = inStock + returnedToStock;

        response = await inventoryModel.findByIdAndUpdate(
          inventoryId,
          {
            inStock: newInStock,
            isUse: quantity,
          },
          { new: true }
        );
      }
    } else {
      response = await inventoryModel.findByIdAndUpdate(
        inventoryId,
        {
          inStock: quantity,
        },
        { new: true }
      );
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Inventory updated successfully",
      data: response,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Convert query params to numbers
    const pageNumber = parseInt(page as string) || 1;
    const limitNumber = parseInt(limit as string) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    let query: any = {};

    // Add status filter if provided
    if (status) {
      query.orderStatus = status;
    }

    // Add search filter if provided
    if (search) {
      // First, find users matching the search criteria
      const users = await usersModel
        .find({
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
          ],
        })
        .select("_id");

      const userIds = users.map((user) => user._id);

      // Add user IDs to query
      if (userIds.length > 0) {
        query.userId = { $in: userIds };
      } else {
        // If no users match, return empty result
        return res.status(httpStatusCode.OK).json({
          success: true,
          message: "No orders found for the search criteria",
          data: [],
          meta: {
            total: 0,
            hasPreviousPage: false,
            hasNextPage: false,
            page: pageNumber,
            limit: limitNumber,
            totalPages: 0,
          },
        });
      }
    }

    // Count total documents for pagination
    const totalOrders = await orderModel.countDocuments(query);

    // Determine sort direction
    const sortDirection = order === "asc" ? 1 : -1;
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortDirection;

    // Get paginated orders with all required fields
    const orders = await orderModel
      .find(query)
      .populate("userId", "fullName email phoneNumber profilePic")
      .populate("venueId", "name address")
      .populate("items.productId", "productName primaryImage")
      .skip(skip)
      .limit(limitNumber)
      .sort(sortOptions)
      .lean();

    // Transform orders to include all required fields
    const transformedOrders = orders.map((order) => {
      const userData = order.userId as any;
      const venueData = order.venueId as any;

      return {
        orderId: order._id,
        orderDate: order.createdAt,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,

        // User details
        user: {
          id: userData?._id,
          fullName: userData?.fullName || "Unknown",
          email: userData?.email || "Unknown",
          phoneNumber: userData?.phoneNumber || "Unknown",
          profilePic: userData?.profilePic || "",
          address: order.address || {},
        },

        // Venue details
        venue: {
          id: venueData?._id || "",
          name: venueData?.name || "Unknown",
          address: venueData?.address || "",
        },

        // Items details
        items: order.items.map((item: any) => {
          const product = item.productId as any;
          return {
            productId: product?._id || item.productId,
            name: product?.productName || "Unknown Product",
            image: product?.primaryImage || "",
            price: item.price,
            quantity: item.quantity,
            total: item.total,
          };
        }),
      };
    });

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Orders retrieved successfully",
      data: transformedOrders,
      meta: {
        total: totalOrders,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: skip + limitNumber < totalOrders,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalOrders / limitNumber),
        sortBy,
        order,
      },
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId) {
      return errorResponseHandler(
        "Order ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!status) {
      return errorResponseHandler(
        "Order status is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const validStatuses = [
      "pending",
      "ready",
      "confirmed",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return errorResponseHandler(
        `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return errorResponseHandler(
        "Order not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    order.orderStatus = status;
    await order.save();

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

const INR = (n: any) => `₹${n ?? 0}`;

export const downloadBookingReceipt = async (booking: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    doc.pipe(stream);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));

    // Register fonts
    const fontPath = path.resolve("src/assets/fonts");
    try {
      doc.registerFont("Roboto-Bold", path.join(fontPath, "Roboto-Bold.ttf"));
      doc.registerFont(
        "Roboto-Medium",
        path.join(fontPath, "Roboto-Medium.ttf")
      );
      doc.registerFont(
        "Roboto-Regular",
        path.join(fontPath, "Roboto-Regular.ttf")
      );
    } catch (e) {
      console.error("Font registration failed, falling back:", e);
      doc.font("Helvetica-Bold");
    }

    // Normalize helpers
    const sanitize = (s: any) =>
      String(s ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const formatBookingDate = (raw: any) => {
      try {
        return new Date(raw)
          .toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })
          .replace(/\n/g, " ");
      } catch {
        return sanitize(raw);
      }
    };

    // Fetch first player name
    const getFirstPlayerName = async (playerId: string): Promise<string> => {
      try {
        const user = await usersModel
          .findById(playerId)
          .select("fullName")
          .exec();
        return user?.fullName || "Unknown Player";
      } catch (err) {
        console.error("Error fetching player:", err);
        return "Unknown Player";
      }
    };

    // Draw a label/value pair at given x,y and return updated y after space
    const drawKeyValueRow = (opts: {
      label: string;
      value: string;
      x: number;
      y: number;
      labelWidth: number;
      valueWidth: number;
      boldValue?: boolean;
    }): number => {
      const { label, value, x, y, labelWidth, valueWidth, boldValue } = opts;

      // Label
      doc
        .font("Roboto-Bold")
        .fontSize(12)
        .fillColor("#0e2642")
        .text(`${label}:`, x, y, { width: labelWidth, align: "left" });

      // Value (sanitized)
      const cleanValue = sanitize(value);
      if (boldValue) doc.font("Roboto-Medium");
      else doc.font("Roboto-Regular");

      const valueY = y; // align top
      doc.fontSize(12).text(cleanValue, x + labelWidth + 10, valueY, {
        width: valueWidth,
        align: "left",
      });

      // Determine required height for this row
      const labelHeight = doc.heightOfString(`${label}:`, {
        width: labelWidth,
        align: "left",
        // font: boldValue ? "Roboto-Medium" : undefined, 
        // size: 12,
      })
      const valueHeight = doc.heightOfString(cleanValue, {
        width: valueWidth,
        align: "left",
        // size: 12,
      });
      const usedHeight = Math.max(labelHeight, valueHeight);

      // Return next y with small gap
      return y + usedHeight + 6; // 6px gap
    };

    // Header
    const drawHeader = async () => {
      const top = 30;

      // Logo
      try {
        const logoPath = path.resolve("src/assets/fonts/appLogo.png");
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, top, { width: 100, height: 50 });
        } else {
          throw new Error("Logo not found");
        }
      } catch (e) {
        console.error("Logo load error:", e);
        doc.rect(40, top, 100, 50).fillAndStroke("#E5E5E5", "#0e2642");
        doc
          .font("Roboto-Regular")
          .fontSize(10)
          .fillColor("#0e2642")
          .text("Logo Not Found", 40, top + 18, {
            width: 100,
            align: "center",
          });
      }

      // Right info block
      const rightX = 300;
      let currentY = top;
      doc
        .font("Roboto-Bold")
        .fontSize(18)
        .fillColor("#0e2642")
        .text(`GST: ${booking.venueId?.gstNumber || "N/A"}`, rightX, currentY);
      currentY += 24;

      const firstPlayerName =
        booking.team1 && Array.isArray(booking.team1) && booking.team1[0]
          ? await getFirstPlayerName(String(booking.team1[0].playerId))
          : "Unknown Player";

      doc.font("Roboto-Bold").fontSize(14).text("Issued To:", rightX, currentY);
      currentY += 18;
      doc
        .font("Roboto-Regular")
        .fontSize(12)
        .text(firstPlayerName, rightX, currentY);
      currentY += 22;

      // Divider line below header
      doc
        .strokeColor("#E5E5E5")
        .lineWidth(1)
        .moveTo(40, top + 80)
        .lineTo(555, top + 80)
        .stroke();

      // Return after header Y
      return top + 80 + 10; // start below line with padding
    };

    // Sections drawing
    const drawSections = async () => {
      let y = await drawHeader();

      // Booking Summary
      doc
        .font("Roboto-Bold")
        .fontSize(16)
        .fillColor("#0e2642")
        .text("Booking Summary", 40, y, { underline: true });
      y += 24;

      const sectionX = 40;
      const labelWidth = 140;
      const valueWidth = 515 - labelWidth - 10; // total usable width

      y = drawKeyValueRow({
        label: "Booking ID",
        value: String(booking._id || "N/A"),
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Game Type",
        value: `${booking.gameType || "N/A"}${
          booking.askToJoin ? " (Ask to Join)" : ""
        }`.trim(),
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Competitive",
        value: booking.isCompetitive ? "Yes" : "No",
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Skill Level Required",
        value: `${booking.skillRequired ?? 0}/100`,
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Date",
        value: formatBookingDate(booking.bookingDate),
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Time Slot",
        value: sanitize(booking.bookingSlots),
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });

      // Venue Details
      y += 4;
      doc
        .font("Roboto-Bold")
        .fontSize(16)
        .fillColor("#0e2642")
        .text("Venue Details", 40, y, { underline: true });
      y += 24;

      const rawAddress = `${booking.venueId?.address || ""}, ${
        booking.venueId?.city || ""
      }, ${booking.venueId?.state || ""}`;
      const normalizedAddress = sanitize(rawAddress);

      y = drawKeyValueRow({
        label: "Venue",
        value: booking.venueId?.name || "N/A",
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Address",
        value: normalizedAddress,
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Court",
        value: booking.courtId?.name || "N/A",
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });

      // Payment Summary
      y += 4;
      doc
        .font("Roboto-Bold")
        .fontSize(16)
        .fillColor("#0e2642")
        .text("Payment Summary", 40, y, { underline: true });
      y += 24;
      y = drawKeyValueRow({
        label: "Booking Amount",
        value: INR(booking.bookingAmount),
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
      });
      y = drawKeyValueRow({
        label: "Total",
        value: INR(booking.bookingAmount),
        x: sectionX,
        y,
        labelWidth,
        valueWidth,
        boldValue: true,
      });

      // After sections, ensure footer doesn't collide; end of content tracked via y
    };

    // Footer pinned near bottom
    const drawFooter = () => {
      const bottomY = doc.page.height - 80;
      doc.font("Roboto-Regular").fontSize(10).fillColor("#808080");
      const footerText = "Thank you for booking with us!";
      const generatedOn = `Generated on: ${new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })}`;

      doc.text(footerText, 40, bottomY, {
        align: "center",
        width: 515,
      });
      doc.text(generatedOn, 40, bottomY + 15, {
        align: "center",
        width: 515,
      });
    };

    // Compose
    drawSections()
      .then(() => {
        drawFooter();
        doc.end();
      })
      .catch((err) => {
        console.error("Rendering error:", err);
        reject(err);
      });
  });
};
