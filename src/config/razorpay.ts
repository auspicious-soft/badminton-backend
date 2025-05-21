import Razorpay from "razorpay";
import { configDotenv } from 'dotenv';
configDotenv()

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "",
})

export default razorpayInstance;
export const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";