import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { queryBuilder } from "src/utils";
import { discountVouchersModel } from "../../models/discount-vouchers/discount-vouchers-schema";
import { PipelineStage } from "mongoose";


export const createDiscountVoucherService = async (payload: any, res: Response) => {
  const newVoucher = new discountVouchersModel(payload);
  const savedVoucher = await newVoucher.save();
  return {
    success: true,
    message: "Discount voucher created successfully",
    data: savedVoucher,
  };
};

export const getDiscountVoucherService = async (id: string, res: Response) => {
  const voucher = await discountVouchersModel.findById(id);
  if (!voucher) return errorResponseHandler("Discount voucher not found", httpStatusCode.NOT_FOUND, res);
  return {
    success: true,
    message: "Discount voucher retrieved successfully",
    data: voucher,
  };
};
export const verifyDiscountVoucherService = async (id: string, res: Response) => {
  const voucher = await discountVouchersModel.findById(id);
  if (!voucher) return errorResponseHandler("Coupon not found", httpStatusCode.NOT_FOUND, res);
  if(voucher.codeActivated >= voucher.activationAllowed){
    return errorResponseHandler("Coupon limit exceeded", httpStatusCode.BAD_REQUEST, res);
  }else{
    voucher.codeActivated += 1;
    await voucher.save();
  }
  return {
    success: true,
    message: "Discount voucher retrieved successfully",
    data: voucher,
  };
};

export const getAllDiscountVouchersService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 0;
  const offset = (page - 1) * limit;
  const { query, sort } = queryBuilder(payload, ["couponCode"]);

  if (payload.sortField) {
    sort[payload.sortField] = payload.sortOrder === "desc" ? -1 : 1 as 1 | -1;
  } else {
    sort['createdAt'] = 1; 
  }

  try {
    const pipeline: PipelineStage[] = [
      {
        $match: query, // Filter by search query
      },
      {
        $lookup: {
          from: "orders", // Join with orders collection
          localField: "_id", // Field in discount vouchers
          foreignField: "voucherId", // Field in orders
          as: "voucher", // Name the joined array
        },
      },
      {
        $addFields: {
          activationCount: { $size: "$voucher" }, // Calculate the count of activations
        },
      },
      // {
      //   $sort: sort, // Apply sorting
      // },
    ];

    // Conditionally add pagination stages
    if (limit > 0) {
      pipeline.push(
        { $skip: offset }, // Apply pagination: skip to the offset
        { $limit: limit } // Apply pagination: limit the number of results
      );
    }

    // Fetch the total number of discount vouchers
    const totalDataCount = await discountVouchersModel.countDocuments(query);

    // Execute the aggregation pipeline
    const results = await discountVouchersModel.aggregate(pipeline);

    return {
      page,
      limit,
      success: true,
      message: "Discount vouchers retrieved successfully",
      total: totalDataCount,
      data: results.map((voucher) => ({
        voucher,
      })),
    };
  } catch (error: any) {
    console.error("Error in getAllDiscountVouchersService:", error.message);
    return {
      page,
      limit,
      success: false,
      message: "Error retrieving discount vouchers",
      total: 0,
      data: [],
      error: error.message,
    };
  }
};

export const updateDiscountVoucherService = async (id: string, payload: any, res: Response) => {
  const updatedVoucher = await discountVouchersModel.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updatedVoucher) return errorResponseHandler("Discount voucher not found", httpStatusCode.NOT_FOUND, res);
  
  return {    
    success: true,
    message: "Discount voucher updated successfully",
    data: updatedVoucher,
  };
};

export const deleteDiscountVoucherService = async (id: string, res: Response) => {
  const deletedVoucher = await discountVouchersModel.findByIdAndDelete(id);
  if (!deletedVoucher) return errorResponseHandler("Discount voucher not found", httpStatusCode.NOT_FOUND, res);
  
  return {
    success: true,
    message: "Discount voucher deleted successfully",
    data: deletedVoucher,
  };
};
