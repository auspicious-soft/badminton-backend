import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { orderModel } from "src/models/admin/order-schema";
import { productModel } from "src/models/admin/products-schema";
import { cartModel } from "src/models/user/user-cart";
import { promise } from "zod";
import mongoose from "mongoose";

export const getMerchandise = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);

    const { type = "all" } = req.query;

    const validType = ["pickleball", "padel", "all"];

    if (!validType.includes((type as string).toLowerCase())) {
      return errorResponseHandler(
        "Invalid Type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const query: any = {
      isActive: true,
    };

    if (type !== "all") {
      query.tags = { $in: [(type as string).toLowerCase()] };
    }

    const data = await productModel.find(query).lean();

    const response = {
      success: true,
      message: "Products retrieved successfully",
      data: data,
    };
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getMerchandiseById = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const { id } = req.params;
    if (!id) {
      return errorResponseHandler(
        "Product ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const product = await productModel
      .findOne({ _id: id, isActive: true })
      .lean();
    if (!product) {
      return errorResponseHandler(
        "Product not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const response = {
      success: true,
      message: "Product retrieved successfully",
      data: product,
    };
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const addToCart = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const userData = req.user as any;
    const { id } = req.body;

    if (!id) {
      return errorResponseHandler(
        "Product ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (!userData || !userData.id) {
      return errorResponseHandler(
        "User authentication required",
        httpStatusCode.UNAUTHORIZED,
        res
      );
    }

    const product = await productModel
      .findOne({ _id: id, isActive: true })
      .lean();

    if (!product) {
      return errorResponseHandler(
        "Product not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const cartItem = await cartModel.findOne({
      userId: userData.id,
      productId: id,
    });

    if (cartItem) {
      return errorResponseHandler(
        "Product already in cart",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Create cart item with all required fields explicitly set
    const newCartItem = await cartModel.create({
      userId: userData.id,
      productId: id,
      quantity: 1,
    });

    const response = {
      success: true,
      message: "Product added to cart successfully",
      data: newCartItem,
    };
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    console.error("Add to cart error:", error);
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getCart = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const userData = req.user as any;
    const cartItems = await cartModel
      .find({ userId: userData.id })
      .populate("productId")
      .lean();

    const response = {
      success: true,
      message: "Cart retrieved successfully",
      data: cartItems,
    };
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const editCart = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const userData = req.user as any;
    const { cartId, quantity } = req.body;
    if (!cartId) {
      return errorResponseHandler(
        "Cart ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    if (!quantity) {
      return errorResponseHandler(
        "Quantity is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const cartItem = await cartModel.findOne({
      _id: cartId,
      userId: userData.id,
    });
    if (!cartItem) {
      return errorResponseHandler(
        "Cart item not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    const product = await productModel
      .findOne({ _id: cartItem.productId, isActive: true })
      .lean();
    if (!product) {
      return errorResponseHandler(
        "Product not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    await cartModel.findByIdAndUpdate(cartId, { quantity });

    const cartItems = await cartModel
      .find({ userId: userData.id })
      .populate("productId")
      .lean();

    const response = {
      success: true,
      message: "Cart item updated successfully",
      data: cartItems,
    };
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const deleteCartItem = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const userData = req.user as any;
    const { cartId } = req.body;
    if (!cartId) {
      return errorResponseHandler(
        "Cart ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const cartItem = await cartModel.findOne({
      _id: cartId,
      userId: userData.id,
    });
    if (!cartItem) {
      return errorResponseHandler(
        "Cart item not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    await cartModel.findByIdAndDelete(cartId);

    const cartItems = await cartModel
      .find({ userId: userData.id })
      .populate("productId")
      .lean();

    const response = {
      success: true,
      message: "Cart item deleted successfully",
    };
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const orderProduct = async (req: Request, res: Response) => {
  try {
    console.log("req.body: ", req.user);
    const userData = req.user as any;
    const { items, venueId, address} = req.body;

    if (!items || items.length === 0) {
      return errorResponseHandler(
        "Items are required",
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

    if(address && typeof address !== 'object') {
      return errorResponseHandler(
        "Address must be an object",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate venue exists
    const venue = await mongoose.model("venues").findById(venueId);
    if (!venue) {
      return errorResponseHandler(
        "Venue not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Process all items and validate inventory
    interface ProcessedItem {
      productId: mongoose.Schema.Types.ObjectId;
      quantity: number;
      price: number;
      total: number;
    }

    const processedItems: ProcessedItem[] = [];

    try {
      await Promise.all(
        items.map(async (item: any) => {
          const product = await productModel
            .findOne({
              _id: item.productId,
              isActive: true,
            })
            .lean();

          if (!product) {
            throw new Error(
              `Product with ID ${item.productId} not found or inactive`
            );
          }

          const venueQuantity = product.venueAndQuantity.find(
            (venue: any) => venue.venueId.toString() === venueId.toString()
          );

          if (!venueQuantity) {
            throw new Error(
              `Product ${product.productName} is not available at this venue`
            );
          }

          if (venueQuantity.quantity < item.quantity) {
            throw new Error(
              `Not enough quantity available for ${product.productName}. Available: ${venueQuantity.quantity}, Requested: ${item.quantity}`
            );
          }

          // Format the item for order creation
          const processedItem: ProcessedItem = {
            productId: product._id as mongoose.Schema.Types.ObjectId,
            quantity: Number(item.quantity),
            price: Number(product.discountedPrice),
            total: Number(product.discountedPrice) * Number(item.quantity),
          };

          processedItems.push(processedItem);
        })
      );
    } catch (error: any) {
      return errorResponseHandler(
        error.message,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Calculate total amount
    const totalAmount = processedItems.reduce(
      (acc: number, item: any) => acc + item.total,
      0
    );

    // Create the order
    const order = await orderModel.create({
      userId: userData.id,
      address: address || {},
      items: processedItems,
      totalAmount,
      venueId,
      status: "pending",
      paymentStatus: "pending",
      pickupCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    });

    // Update product quantities after successful order creation
    await Promise.all(
      processedItems.map(async (item: any) => {
        await productModel.findByIdAndUpdate(
          item.productId,
          {
            $inc: {
              "venueAndQuantity.$[venue].quantity": -item.quantity,
            },
          },
          {
            arrayFilters: [{ "venue.venueId": venueId }],
          }
        );
      })
    );

    const response = {
      success: true,
      message: "Order placed successfully",
      data: {
        orderId: order._id,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    };

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    console.error("Order product error:", error);
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getMyOrders = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const { page = 1, limit = 10, status } = req.query;

    // Parse pagination parameters
    const pageNumber = parseInt(page as string) || 1;
    const limitNumber = parseInt(limit as string) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    const query: any = { userId: userData.id };

    // Add status filter if provided
    if (
      status &&
      ["pending", "ready", "completed", "cancelled"].includes(status as string)
    ) {
      query.status = status;
    }

    // Count total orders for pagination
    const totalOrders = await orderModel.countDocuments(query);

    // Get orders with pagination
    const orders = await orderModel
      .find(query)
      .populate({
        path: "items.productId",
        select: "productName primaryImage discountedPrice",
      })
      .populate({
        path: "venueId",
        select: "name address",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Transform orders to include required fields
    const transformedOrders = orders.map((order) => {
      // Handle venue data safely
      const venueData = order.venueId as any; // Cast to any to access properties

      return {
        orderId: order._id,
        address: order.address || {},
        orderDate: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        venue: {
          id: venueData?._id || order.venueId,
          name: venueData?.name || "Unknown Venue",
          address: venueData?.address || "Unknown Address",
        },
        items: order.items.map((item: any) => ({
          productId: item.productId?._id,
          name: item.productId?.productName || "Unknown Product",
          image: item.productId?.primaryImage || "",
          price: item.price,
          quantity: item.quantity,
          total: item.total,
        })),
      };
    });

    const response = {
      success: true,
      message: "Orders retrieved successfully",
      data: transformedOrders,
      meta: {
        total: totalOrders,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalOrders / limitNumber),
        hasNextPage: skip + limitNumber < totalOrders,
        hasPreviousPage: pageNumber > 1,
      },
    };

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    console.error("Get orders error:", error);
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    let userData = req.user as any;
    const { id } = req.params;

    if (!id) {
      return errorResponseHandler(
        "Order ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate if order exists and belongs to the user
    const order = await orderModel
      .findOne({
        _id: id,
        userId: userData.id,
      })
      .populate({
        path: "items.productId",
        select: "productName primaryImage discountedPrice description tags",
      })
      .populate({
        path: "venueId",
        select: "name address contactNumber email operatingHours",
      })
      .populate({
        path: "userId",
        select: "fullName email phoneNumber",
      })
      .lean();

    if (!order) {
      return errorResponseHandler(
        "Order not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Cast populated data to access properties
    const venueData = order.venueId as any;
    userData = order.userId as any;
    // Cast userId to any to access properties

    // Format order data with all possible fields
    const formattedOrder = {
      // Order details
      orderId: order._id,
      address: order.address || {},
      orderDate: order.createdAt,
      updatedAt: order.updatedAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      cancellationReason: order.cancellationReason,

      // Venue details
      venue: {
        id: venueData?._id || order.venueId,
        name: venueData?.name || "Unknown Venue",
        address: venueData?.address || "Unknown Address",
        contactNumber: venueData?.contactNumber,
        email: venueData?.email,
        operatingHours: venueData?.operatingHours,
      },

      // User details
      user: {
        id: userData?._id || order.userId,
        name: userData?.fullName || "Unknown User",
        email: userData?.email,
        phoneNumber: userData?.phoneNumber,
      },

      // Items details with full product information
      items: order.items.map((item: any) => {
        const product = item.productId as any;
        return {
          id: item._id,
          productId: product?._id,
          name: product?.productName || "Unknown Product",
          image: product?.primaryImage || "",
          description: product?.description || "",
          tags: product?.tags || [],
          price: item.price,
          quantity: item.quantity,
          total: item.total,
        };
      }),
    };

    const response = {
      success: true,
      message: "Order retrieved successfully",
      data: formattedOrder,
    };

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    console.error("Get order by ID error:", error);
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
