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
import PDFDocument from "pdfkit";
import path from "path";

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

//Download order receipt in pdf my both user and admin using orderId

export const downloadOrderReceipt = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return errorResponseHandler(
        "Order ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const order = await orderModel
      .findById(orderId)
      .populate("userId", "fullName email phoneNumber profilePic")
      .populate("venueId", "name address")
      .populate("items.productId", "productName primaryImage");

    if (!order) {
      return errorResponseHandler(
        "Order not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Create PDF document with smaller margins
    const doc = new PDFDocument({
      size: "A4",
      margin: 30, // Further reduced margins
      info: {
        Title: `Order Receipt #${order._id}`,
        Author: "Your Company Name",
      },
      autoFirstPage: true, // Ensure single page
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=order-receipt-${order._id}.pdf`
    );

    // Pipe the PDF document to the response
    doc.pipe(res);

    // Register custom fonts from assets folder
    const fontPath = path.join(process.cwd(), "src", "assets", "fonts");
    doc.registerFont("Regular", path.join(fontPath, "Roboto-Regular.ttf"));
    doc.registerFont("Bold", path.join(fontPath, "Roboto-Bold.ttf"));
    doc.registerFont("Medium", path.join(fontPath, "Roboto-Medium.ttf"));

    // Fonts and Colors
    const primaryColor = "#1E3A8A"; // Deep blue
    const accentColor = "#3B82F6"; // Light blue

    // Rupee Symbol (using Unicode)
    const rupeeSymbol = "₹"; // Unicode for ₹

    // Header Section
    // Company Logo (Uncomment and provide path if available)
    // doc.image(path.join(process.cwd(), 'src', 'assets', 'logo.png'), 30, 20, { width: 80, height: 30 });

    doc
      .fontSize(16)
      .font("Bold")
      .fillColor(primaryColor)
      .text("Order Receipt", 30, 30, { align: "center" });
    doc
      .fontSize(8)
      .font("Regular")
      .fillColor("#4B5563")
      .text(`Receipt #${order._id}`, 30, 50, { align: "center" });
    doc
      .moveTo(30, 60)
      .lineTo(565, 60)
      .lineWidth(1)
      .strokeColor(accentColor)
      .stroke();
    doc.moveDown(0.5);

    // Two-column layout for Order and Customer Info
    const leftColumnX = 30;
    const rightColumnX = 300;
    const sectionY = doc.y;

    // Order Information (Left Column)
    doc
      .fontSize(10)
      .font("Bold")
      .fillColor(primaryColor)
      .text("Order Details", leftColumnX, sectionY);
    doc
      .fontSize(8)
      .font("Regular")
      .fillColor("#4B5563")
      .text(`Order ID: ${order._id}`, leftColumnX, sectionY + 15)
      .text(
        `Date: ${
          order.createdAt
            ? new Date(order.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "N/A"
        }`,
        leftColumnX,
        sectionY + 27
      )
      .text(`Status: ${order.orderStatus}`, leftColumnX, sectionY + 39)
      .text(`Payment: ${order.paymentStatus}`, leftColumnX, sectionY + 51);

    // Customer Information (Right Column)
    const userData = order.userId as any;
    doc
      .fontSize(10)
      .font("Bold")
      .fillColor(primaryColor)
      .text("Customer Details", rightColumnX, sectionY);
    doc
      .fontSize(8)
      .font("Regular")
      .fillColor("#4B5563")
      .text(
        `Name: ${userData?.fullName || "Unknown"}`,
        rightColumnX,
        sectionY + 15
      )
      .text(
        `Email: ${userData?.email || "Unknown"}`,
        rightColumnX,
        sectionY + 27
      )
      .text(
        `Phone: ${userData?.phoneNumber || "Unknown"}`,
        rightColumnX,
        sectionY + 39
      );

    // Address
    if (order.address) {
      doc.text(
        `Address: ${order.address.street || ""}, ${order.address.city || ""}, ${
          order.address.state || ""
        } ${order.address.pinCode || ""}`,
        rightColumnX,
        sectionY + 51,
        { width: 250, lineBreak: true }
      );
    }

    // Venue Information
    const venueData = order.venueId as any;
    doc.moveDown(1);
    const venueY = doc.y;
    doc
      .fontSize(10)
      .font("Bold")
      .fillColor(primaryColor)
      .text("Venue Details", leftColumnX, venueY);
    doc
      .fontSize(8)
      .font("Regular")
      .fillColor("#4B5563")
      .text(`Name: ${venueData?.name || "Unknown"}`, leftColumnX, venueY + 15)
      .text(
        `Address: ${venueData?.address || "Unknown"}`,
        leftColumnX,
        venueY + 27,
        {
          width: 250,
        }
      );
    doc.moveDown(1);

    // Items Table
    doc
      .fontSize(10)
      .font("Bold")
      .fillColor(primaryColor)
      .text("Items Purchased", leftColumnX, doc.y);
    doc.moveDown(0.3);

    // Table headers
    const tableTop = doc.y;
    const itemX = 30;
    const descriptionX = 60;
    const quantityX = 290;
    const priceX = 350;
    const totalX = 450;

    doc
      .fontSize(8)
      .font("Bold")
      .fillColor(primaryColor)
      .text("No.", itemX, tableTop)
      .text("Item", descriptionX, tableTop, { width: 200 })
      .text("Qty", quantityX, tableTop)
      .text("Price", priceX, tableTop)
      .text("Total", totalX, tableTop);

    // Table header underline
    doc
      .moveTo(30, tableTop + 10)
      .lineTo(565, tableTop + 10)
      .lineWidth(1)
      .strokeColor(accentColor)
      .stroke();
    doc.moveDown(0.3);

    // Table rows
    let tableRowY = doc.y;
    let totalAmount = 0;
    const maxItems = 8; // Reduced to ensure single page
    order.items.slice(0, maxItems).forEach((item: any, i: number) => {
      const product = item.productId as any;
      const productName = product?.productName || "Unknown Product";
      const y = tableRowY + i * 15; // Reduced row height

      doc
        .fontSize(7)
        .font("Regular")
        .fillColor("#4B5563")
        .text((i + 1).toString(), itemX, y)
        .text(productName, descriptionX, y, { width: 200, ellipsis: true })
        .text(item.quantity.toString(), quantityX, y)
        .text(`${rupeeSymbol}${item.price.toFixed(2)}`, priceX, y)
        .text(`${rupeeSymbol}${item.total.toFixed(2)}`, totalX, y);

      totalAmount += item.total;
    });

    // Total Amount
    doc.moveDown(0.5);
    doc
      .moveTo(30, doc.y)
      .lineTo(565, doc.y)
      .lineWidth(1)
      .strokeColor(accentColor)
      .stroke();
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font("Bold")
      .fillColor(primaryColor)
      .text(
        `${rupeeSymbol}${order.totalAmount.toFixed(2)}`,
        totalX - 50,
        doc.y,
        {
          align: "right",
        }
      );

    // Payment Information
    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .font("Regular")
      .fillColor("#4B5563")
      .text(
        `Payment Method: ${order.razorpayPaymentId ? "Razorpay" : "Unknown"}`,
        rightColumnX,
        doc.y,
        { align: "right" }
      )
      .text(
        `Payment ID: ${order.razorpayPaymentId || "N/A"}`,
        rightColumnX,
        doc.y + 12,
        {
          align: "right",
        }
      );

    // Footer
    const footerY = doc.page.height - 60; // Moved up to save space
    doc
      .fontSize(7)
      .font("Regular")
      .fillColor("#6B7280")
      .text("Thank you for your purchase!", 30, footerY, { align: "center" })
      .text(
        "Contact us at support@yourcompany.com for any inquiries.",
        30,
        footerY + 12,
        { align: "center" }
      );

    // Finalize the PDF
    doc.end();
  } catch (error: any) {
    const { code, message }: { code: number; message: string } =
      errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
