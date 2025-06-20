import { Request, Response } from "express";
import razorpayInstance from "src/config/razorpay";
import { httpStatusCode } from "src/lib/constant";
import { playcoinModel } from "src/models/admin/playcoin-schema";
import { transactionModel } from "src/models/admin/transaction-schema";
import { usersModel } from "src/models/user/user-schema";

export const logout = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const fcmToken = req.body.fcmToken;

    if (!fcmToken) {
      return res.status(httpStatusCode.BAD_REQUEST).send({
        success: false,
        message: "FCM token is required",
      });
    }

    const user = await usersModel.findOneAndUpdate(
      { _id: userData.id },
      { $pull: { fcmToken: fcmToken } },
      { new: true }
    );

    if (!user) {
      return res.status(httpStatusCode.NOT_FOUND).send({
        success: false,
        message: "User not found or FCM token not associated with user",
      });
    }

    return res.status(httpStatusCode.OK).send({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while logging out",
    });
  }
};

export const getPackages = async (req: Request, res: Response) => {
  try {
    const data = await playcoinModel.find({ isActive: true });

    return res.status(httpStatusCode.OK).send({
      success: true,
      message: "Packages fetched successfully",
      data: data,
    });
  } catch (error: any) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while logging out",
    });
  }
};
export const buyPackages = async (req: Request, res: Response) => {
  try {
    const { packageId = null, amount = null } = req.body;
    const userData = req.user as any;
    let finalAmount = 0;
    let coinReceivable = 0;

    if (!packageId && !amount) {
      return res.status(httpStatusCode.BAD_REQUEST).send({
        success: false,
        message: "Need atleast package or amount",
      });
    }

    if (packageId) {
      const checkPackage = await playcoinModel.findById(packageId);

      if (!checkPackage) {
        return res.status(httpStatusCode.BAD_REQUEST).send({
          success: false,
          message: "Package does not exist",
        });
      }

      finalAmount = checkPackage.amount;
      coinReceivable = checkPackage.coinReceivable || 0;
    } else {
      if (amount <= 0) {
        return res.status(httpStatusCode.BAD_REQUEST).send({
          success: false,
          message: "Entered invalid amount",
        });
      }

      finalAmount = amount;
      coinReceivable = amount;
    }

    const transaction = await transactionModel.create({
      userId: userData.id,
      amount: finalAmount,
      currency: "INR",
      status: "created",
      playcoinsReceived: coinReceivable,
    });

    const options = {
      amount: finalAmount * 100, // Amount in paise
      currency: "INR",
      receipt: userData.id,
      notes: {
        transactionId: transaction._id,
        packageId,
        finalAmount,
        playcoinsReceived: coinReceivable,
      },
    };

    interface RazorpayOrder {
      id: string;
    }

    const razorpayOrder: RazorpayOrder = (await razorpayInstance.orders.create(
      options as any
    )) as any;

    const updateTransaction = await transactionModel.findByIdAndUpdate(
      {
        _id: transaction._id,
      },
      {
        $set: {
          userId: userData.id,
          amount: finalAmount,
          currency: "INR",
          status: "created",
          playcoinsReceived: coinReceivable,
          razorpayOrderId: razorpayOrder.id,
        },
      },
      {new: true}
    );

    return res.status(httpStatusCode.OK).send({
      success: true,
      message: "Payment initiated successfully",
      data: updateTransaction,
    });
  } catch (error: any) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while logging out",
    });
  }
};
