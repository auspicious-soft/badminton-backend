import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
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
