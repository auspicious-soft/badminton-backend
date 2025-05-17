import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "src/lib/errors/error-response-handler";
import { orderModel } from "src/models/admin/order-schema";
import { productModel } from "src/models/admin/products-schema";
import { cartModel } from "src/models/user/user-cart";

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
      quantity: 1
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
    const { items, venueId } = req.body;

    if(!items || items.length === 0) {
      return errorResponseHandler(
        "Items are required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if(!venueId) {
      return errorResponseHandler(
        "Venue ID is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    



    const response = {
      success: true,
      message: "Order placed successfully",
      data: [],
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






