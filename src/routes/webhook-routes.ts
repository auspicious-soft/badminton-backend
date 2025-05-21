import { Router } from "express";
import { razorpayWebhookHandler } from "../controllers/webhooks/razorpay-webhook";

const router = Router();

// Razorpay webhook route - no authentication required
router.post("/razorpay", razorpayWebhookHandler);

export default router;