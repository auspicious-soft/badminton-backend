import { NextFunction, Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import jwt, { JwtPayload } from "jsonwebtoken";
import { configDotenv } from "dotenv";
import { decode } from 'next-auth/jwt'
import { usersModel } from "src/models/user/user-schema";
configDotenv()
declare global {
    namespace Express {
        interface Request {
            user?: string | JwtPayload
        }
    }
}

export const checkPublisherAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(" ")[1]
        if (!token) return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized token missing" })
        const decoded = await decode({
            secret: process.env.AUTH_SECRET as string,
            token,
            salt: process.env.JWT_SALT as string
        })
        if (!decoded) return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized token invalid or expired" });
        (req as any).currentUser = decoded.id

        next()
    } catch (error) { 
        return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized" })
    }
}
export const checkAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(" ")[1]
        if (!token) return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized token missing" })

        const isMobileApp = req.headers['x-client-type'] === 'mobile'

        if (isMobileApp) {
            const decoded = jwt.verify(token, process.env.AUTH_SECRET as string)
            if (!decoded) return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized token invalid or expired" })
            req.user = decoded
        }
        else {
            const decoded = await decode({
                secret: process.env.AUTH_SECRET as string,
                token,
                salt: process.env.JWT_SALT as string
            })
            if (!decoded) return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized token invalid or expired" });
                (req as any).currentUser = decoded.id
            }

        next()
    } catch (error) {
        return res.status(httpStatusCode.UNAUTHORIZED).json({ success: false, message: "Unauthorized" })
    }
}