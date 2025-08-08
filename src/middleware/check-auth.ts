import { NextFunction, Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import jwt, { JwtPayload } from "jsonwebtoken";
import { configDotenv } from "dotenv";
import { Socket } from "socket.io";
import { decode } from "next-auth/jwt";
import { usersModel } from "src/models/user/user-schema";
configDotenv();
declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
    }
  }
}

export const checkAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized: token missing",
        timestamp: new Date().toISOString(),
      });

    const decoded = jwt.verify(
      token,
      process.env.AUTH_SECRET as string
    ) as JwtPayload & { id: string };

    const todayDate = new Date();

    const user = await usersModel.findOne({
      _id: decoded?.id,
    });

    if (
      user?.permanentBlackAfter &&
      user.isBlocked &&
      user.permanentBlackAfter < todayDate
    ) {
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized: user is permanently deleted",
      });
    }

    if (!user || !decoded.verificationToken) {
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized: user not found!",
        timestamp: new Date().toISOString(),
      });
    }

    if (!decoded)
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized: token invalid or expired",
        timestamp: new Date().toISOString(),
      });

    req.user = decoded as JwtPayload;
    next();
  } catch (error) {
    return res.status(httpStatusCode.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized: invalid authentication",
      timestamp: new Date().toISOString(),
    });
  }
};

export const checkOTPAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res
        .status(httpStatusCode.UNAUTHORIZED)
        .json({ success: false, message: "Unauthorized token missing" });

    const decoded = jwt.verify(
      token,
      process.env.AUTH_SECRET as string
    ) as JwtPayload & { id: string };
    const user = await usersModel.findOne({
      _id: decoded?.id,
      isBlocked: false,
    });
    if (!user || decoded.verificationToken) {
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized user not found",
      });
    }

    if (!decoded)
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized token invalid or expired",
      });
    req.user = decoded as JwtPayload;
    next();
  } catch (error) {
    return res
      .status(httpStatusCode.UNAUTHORIZED)
      .json({ success: false, message: "Unauthorized" });
  }
};

export const checkAdminAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res
        .status(httpStatusCode.UNAUTHORIZED)
        .json({ success: false, message: "Unauthorized token missing" });

    const decoded = await decode({
      secret: process.env.AUTH_SECRET as string,
      token,
      salt: process.env.JWT_SALT as string,
    });
    if (!decoded)
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized token invalid or expired",
      });

    // Attach the full decoded object as currentUser
    (req as any).currentUser = decoded;

    // Also attach the admin ID in a standard format for easier access
    // This handles different possible structures of the decoded token
    (req as any).adminId = decoded.id || decoded.sub || decoded._id;

    // For backward compatibility, also set user property
    req.user = {
      id: (req as any).adminId,
      ...decoded,
    };

    next();
  } catch (error) {
    return res
      .status(httpStatusCode.UNAUTHORIZED)
      .json({ success: false, message: "Unauthorized" });
  }
};

export const authenticateSocket = (socket: Socket): Promise<any> => {
  return new Promise((resolve, reject) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return reject(new Error("Authentication error: Token not provided"));
      }

      try {
        const decoded = jwt.verify(
          String(token),
          process.env.AUTH_SECRET || "your-jwt-secret"
        );

        resolve(decoded);
      } catch (jwtError: unknown) {
        reject(new Error(`Invalid token: ${(jwtError as Error).message}`));
      }
    } catch (error) {
      reject(new Error("Server error during authentication"));
    }
  });
};
