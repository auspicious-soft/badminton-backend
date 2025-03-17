import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { queryBuilder } from "src/utils";
import { ordersModel } from "../../models/orders/orders-schema";
import { customAlphabet } from "nanoid";
import { productsModel } from "../../models/products/products-schema"; // Assuming you have a products model

export const createOrderService = async (payload: any, res: Response) => {

  // Check if any product is discounted
  const products = await productsModel.find({ _id: { $in: payload.productIds } });
  const hasDiscountedProduct = products.some(product => product.isDiscounted);

  if (hasDiscountedProduct && payload.voucherId) {
    return errorResponseHandler(
      "Voucher cannot be applied to discounted products",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const identifier = customAlphabet("0123456789", 5);
  payload.identifier = identifier();
  const newOrder = new ordersModel(payload);
  const savedOrder = await newOrder.save();
  return {
    success: true,
    message: "Order created successfully",
    data: savedOrder,
  };
};

export const getOrderService = async (id: any, res: Response) => {
  const order = await ordersModel.findById(id);
  // let query:any  = {}
  // if(payload)
  // const usersTotalAmount =  await ordersModel.find({userId : id, ...query}).select('totalAmount')
  
  if (!order)
    return errorResponseHandler(
      "Order not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  return {
    success: true,
    message: "Order retrieved successfully",
    data: order,
  };
};

export const getAllOrdersService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["identifier", "status"]);

  const totalDataCount =
    Object.keys(query).length < 1
      ? await ordersModel.countDocuments()
      : await ordersModel.countDocuments(query);
  const results = await ordersModel
    .find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .select("-__v");
  if (results.length)
    return {
      page,
      limit,
      success: true,
      message: "Orders retrieved successfully",
      total: totalDataCount,
      data: results,
    };
  else {
    return {
      data: [],
      page,
      limit,
      success: false,
      message: "No orders found",
      total: 0,
    };
  }
};

export const updateOrderService = async (
  id: string,
  payload: any,
  res: Response
) => {
  const updatedOrder = await ordersModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedOrder)
    return errorResponseHandler(
      "Order not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  return {
    success: true,
    message: "Order updated successfully",
    data: updatedOrder,
  };
};

export const deleteOrderService = async (id: string, res: Response) => {
  const deletedOrder = await ordersModel.findByIdAndDelete(id);
  if (!deletedOrder)
    return errorResponseHandler(
      "Order not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  return {
    success: true,
    message: "Order deleted successfully",
    data: deletedOrder,
  };
};
