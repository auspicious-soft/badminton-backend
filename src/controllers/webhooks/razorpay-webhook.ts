import { Request, Response } from "express";
import crypto from "crypto";
import { transactionModel } from "../../models/admin/transaction-schema";
import { bookingModel } from "../../models/venue/booking-schema";
import mongoose from "mongoose";
import { httpStatusCode } from "../../lib/constant";
import { createNotification } from "../../models/notification/notification-schema";
import { configDotenv } from "dotenv";
import { bookingRequestModel } from "src/models/venue/booking-request-schema";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { chatModel } from "src/models/chat/chat-schema";
configDotenv();

export const razorpayWebhookHandler = async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not defined");
      return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Webhook secret not configured",
      });
    }

    const signature = req.headers["x-razorpay-signature"] as string;
    const payload = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Invalid webhook signature");
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Invalid signature",
      });
    }

    // Process the webhook event
    const event = req.body;
    const eventType = event.event;

    // Handle payment events
    if (
      eventType === "payment.captured" ||
      eventType === "payment.authorized"
    ) {
      const paymentId = event.payload.payment.entity.id;
      const orderId = event.payload.payment.entity.order_id;
      const amount = event.payload.payment.entity.amount / 100; // Convert from paise to rupees
      const status =
        eventType === "payment.captured" ? "captured" : "authorized";

      // Check if this transaction has already been processed
      const existingTransaction = await transactionModel.findOne({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        isWebhookVerified: true,
      });

      if (existingTransaction) {
        console.log(`Transaction ${paymentId} already processed, skipping`);
        return res.status(httpStatusCode.OK).json({
          success: true,
          message: "Payment already processed",
        });
      }

      // Start a session for transaction consistency
      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        // Find and update the transaction
        const transaction = await transactionModel.findOneAndUpdate(
          { razorpayOrderId: orderId },
          {
            razorpayPaymentId: paymentId,
            razorpaySignature: signature, // Store the signature from the webhook
            status,
            isWebhookVerified: true,
            paymentDate: new Date(),
          },
          { new: true, session }
        );

        if (!transaction) {
          console.error(`Transaction not found for order ID: ${orderId}`);
          await session.abortTransaction();
          return res.status(httpStatusCode.OK).json({
            success: false,
            message: "Transaction not found, but acknowledging webhook",
          });
        }

        // Check if this was a combined payment (playcoins + razorpay)
        if (
          transaction.method === "both" &&
          transaction.playcoinsUsed > 0 &&
          !transaction.playcoinsDeducted
        ) {
          // Deduct playcoins and release reserved amount in one operation
          await additionalUserInfoModel.updateOne(
            { userId: transaction.userId },
            { $inc: { playCoins: -transaction.playcoinsUsed } },
            { session }
          );

          // Mark playcoins as deducted
          await transactionModel.findByIdAndUpdate(
            transaction._id,
            {
              playcoinsDeducted: true,
              playcoinsReserved: false,
            },
            { session }
          );
        }

        // Update all associated bookings
        if (transaction.bookingId && transaction.bookingId.length > 0) {
          await bookingModel.updateMany(
            { _id: { $in: transaction.bookingId } },
            { bookingPaymentStatus: true },
            { session }
          );

          // Update player payment status in each booking
          const bookings = await bookingModel.find(
            { _id: { $in: transaction.bookingId } },
            null,
            { session }
          );

          const paidForPlayerIds =
            transaction?.paidFor?.map((id: any) => id.toString()) || [];

          for (const booking of bookings) {
            // Update team1 players
            booking.team1 = booking.team1.map((player: any) => {
              if (
                player.playerId &&
                paidForPlayerIds.includes(player.playerId.toString())
              ) {
                player.paymentStatus = "Paid";
              }
              return player;
            });

            // Update team2 players
            booking.team2 = booking.team2.map((player: any) => {
              if (
                player.playerId &&
                paidForPlayerIds.includes(player.playerId.toString())
              ) {
                player.paymentStatus = "Paid";
              }
              return player;
            });

            await booking.save({ session });

            const checkGroupExist = await chatModel.findOne({
              bookingId: booking._id,
            });

            if (!checkGroupExist) {
              await chatModel.create({
                bookingId: booking._id,
                chatType: "group",
                groupName: `Booking Chat - ${booking._id}`,
                participants: [
                  // booking.userId,
                  ...booking.team1.map((player: any) => player.playerId),
                  ...booking.team2.map((player: any) => player.playerId),
                ],
                groupAdmin: [booking.userId],
                messages: [],
                isActive: true,
              });
            }

            // Create notification for booking owner
            await createNotification({
              recipientId: booking.userId,
              senderId: transaction.userId,
              type: "PAYMENT_SUCCESSFUL",
              title: "Payment Successful",
              message: `Your payment of ₹${amount} for booking has been successfully processed.`,
              category: "PAYMENT",
              referenceId: booking._id,
              referenceType: "bookings",
            });
          }
        }

        // Check if this is a join request by looking at the transaction notes
        if (
          transaction.notes &&
          transaction.notes.requestedTeam &&
          transaction.notes.requestedPosition
        ) {
          // This is a join request payment
          if (!transaction.bookingId || transaction.bookingId.length === 0) {
            console.error("Booking ID is missing in transaction");
            await session.abortTransaction();
            return res
              .status(httpStatusCode.BAD_REQUEST)
              .json({ success: false, message: "Booking ID is missing" });
          }
          const bookingId = transaction.bookingId[0];
          const requestedTeam = transaction.notes.requestedTeam;
          const requestedPosition = transaction.notes.requestedPosition;

          // Find the booking request
          const bookingRequest = await bookingRequestModel.findOne({
            bookingId,
            requestedBy: transaction.userId,
            requestedTeam,
            requestedPosition,
            transactionId: transaction._id,
          });

          if (bookingRequest) {
            // Update the booking request status
            bookingRequest.status = "completed";
            bookingRequest.paymentStatus = "Paid";
            await bookingRequest.save({ session });

            // Update the booking to add the player to the requested team and position
            const booking = await bookingModel.findById(bookingId);

            if (booking) {
              // Create player object with payment details
              const playerObject = {
                playerId: transaction.userId,
                playerType: requestedPosition,
                playerPayment: transaction.amount,
                paymentStatus: "Paid",
                transactionId: transaction._id,
                paidBy: "Self",
                racketA: transaction.notes.racketA || 0,
                racketB: transaction.notes.racketB || 0,
                racketC: transaction.notes.racketC || 0,
                balls: transaction.notes.balls || 0,
              };

              // Add player to the requested team - use findIndex and update approach to avoid conflicts
              if (requestedTeam === "team1") {
                const positionIndex = booking.team1.findIndex(
                  (player: any) => player.playerType === requestedPosition
                );

                if (positionIndex >= 0) {
                  booking.team1[positionIndex] = playerObject;
                } else {
                  booking.team1.push(playerObject);
                }
              } else if (requestedTeam === "team2") {
                const positionIndex = booking.team2.findIndex(
                  (player: any) => player.playerType === requestedPosition
                );

                if (positionIndex >= 0) {
                  booking.team2[positionIndex] = playerObject;
                } else {
                  booking.team2.push(playerObject);
                }
              }

              await booking.save({ session });

              const checkGroupExist = await chatModel.findOne({
                bookingId: booking._id,
                participants: { $all: [booking.userId, transaction.userId] },
              });

              if (!checkGroupExist) {
                await chatModel.updateOne(
                  { bookingId: booking._id },
                  {
                    $addToSet: {
                      participants: transaction.userId,
                    },
                  },
                  { session }
                );
              }

              // Create notifications for both the requester and the booking owner
              await createNotification(
                {
                  recipientId: transaction.userId,
                  senderId: booking.userId,
                  type: "GAME_REQUEST_ACCEPTED",
                  title: "Join Request Accepted",
                  message: `Your request to join the game has been accepted and payment processed.`,
                  category: "GAME",
                  referenceId: bookingId,
                  referenceType: "bookings",
                },
                { session }
              );

              await createNotification(
                {
                  recipientId: booking.userId,
                  senderId: transaction.userId,
                  type: "PLAYER_JOINED_GAME",
                  title: "Player Joined Game",
                  message: `A player has joined your game and completed payment.`,
                  category: "GAME",
                  referenceId: bookingId,
                  referenceType: "bookings",
                },
                { session }
              );
            }
          }
        }

        await session.commitTransaction();

        return res.status(httpStatusCode.OK).json({
          success: true,
          message: "Payment webhook processed successfully",
        });
      } catch (error) {
        await session.abortTransaction();
        console.error("Error processing payment webhook:", error);

        // If it's a write conflict, return a success response to prevent retries
        if (
          (error as Error).message &&
          (error as Error).message.includes("Write conflict")
        ) {
          console.log(
            "Write conflict detected, returning success to prevent retries"
          );
          return res.status(httpStatusCode.OK).json({
            success: true,
            message: "Payment acknowledged (write conflict detected)",
          });
        }

        throw error;
      } finally {
        session.endSession();
      }
    }

    // Handle payment failed event
    else if (eventType === "payment.failed") {
      const paymentId = event.payload.payment.entity.id;
      const orderId = event.payload.payment.entity.order_id;
      const failureReason =
        event.payload.payment.entity.error_description || "Payment failed";

      // Update transaction with failure details
      const transaction = await transactionModel.findOneAndUpdate(
        { razorpayOrderId: orderId },
        {
          razorpayPaymentId: paymentId,
          razorpaySignature: signature, // Store the signature from the webhook
          status: "failed",
          failureReason,
        },
        { new: true }
      );

      if (
        transaction &&
        transaction.bookingId &&
        transaction.bookingId.length > 0
      ) {
        // Create notification for payment failure
        for (const bookingId of transaction.bookingId) {
          const booking = await bookingModel.findById(bookingId);
          if (booking) {
            await createNotification({
              recipientId: booking.userId,
              senderId: transaction.userId,
              type: "PAYMENT_FAILED",
              title: "Payment Failed",
              message: `Your payment for booking failed: ${failureReason}`,
              category: "PAYMENT",
              referenceId: bookingId,
              referenceType: "bookings",
            });
          }
        }
      }

      return res.status(httpStatusCode.OK).json({
        success: true,
        message: "Payment failure recorded",
      });
    }

    // Handle refund events
    else if (
      ["refund.created", "refund.processed", "refund.failed"].includes(
        eventType
      )
    ) {
      const refundId = event.payload.refund.entity.id;
      const paymentId = event.payload.refund.entity.payment_id;
      const amount = event.payload.refund.entity.amount / 100; // Convert from paise to rupees
      const status =
        eventType === "refund.processed"
          ? "refunded"
          : eventType === "refund.failed"
          ? "failed"
          : "created";

      // Find transaction by payment ID
      const transaction = await transactionModel.findOne({
        razorpayPaymentId: paymentId,
      });

      if (!transaction) {
        console.error(`Transaction not found for payment ID: ${paymentId}`);
        return res.status(httpStatusCode.OK).json({
          success: false,
          message: "Transaction not found, but acknowledging webhook",
        });
      }

      // Update transaction with refund details
      await transactionModel.findByIdAndUpdate(transaction._id, {
        refundId,
        refundedAmount: amount,
        status: status === "refunded" ? "refunded" : transaction.status,
      });

      // If refund was processed successfully, update bookings and create notifications
      if (
        status === "refunded" &&
        transaction.bookingId &&
        transaction.bookingId.length > 0
      ) {
        const session = await mongoose.startSession();

        try {
          session.startTransaction();

          // Update player payment status in each booking
          const bookings = await bookingModel.find({
            _id: { $in: transaction.bookingId },
          });

          const paidForPlayerIds =
            transaction.paidFor?.map((id) => id.toString()) || [];

          for (const booking of bookings) {
            // Create notification for refund
            await createNotification({
              recipientId: booking.userId,
              senderId: transaction.userId,
              type: "REFUND_COMPLETED",
              title: "Refund Completed",
              message: `Your refund of ₹${amount} has been processed successfully.`,
              category: "PAYMENT",
              referenceId: booking._id,
              referenceType: "bookings",
            });

            // Update player payment status to "Refunded" if needed
            // This depends on your business logic - whether you want to mark as refunded
            // or keep as paid but track the refund separately
          }

          await session.commitTransaction();
        } catch (error) {
          await session.abortTransaction();
          console.error("Error processing refund webhook:", error);
          throw error;
        } finally {
          session.endSession();
        }
      }

      // For failed refunds, notify users
      else if (
        status === "failed" &&
        transaction.bookingId &&
        transaction.bookingId.length > 0
      ) {
        for (const bookingId of transaction.bookingId) {
          const booking = await bookingModel.findById(bookingId);
          if (booking) {
            await createNotification({
              recipientId: booking.userId,
              senderId: transaction.userId,
              type: "REFUND_FAILED",
              title: "Refund Failed",
              message: `Your refund of ₹${amount} could not be processed. Please contact support.`,
              category: "PAYMENT",
              referenceId: bookingId,
              referenceType: "bookings",
            });
          }
        }
      }

      return res.status(httpStatusCode.OK).json({
        success: true,
        message: `Refund ${status} recorded successfully`,
      });
    }

    // For other events, just acknowledge receipt
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: `Webhook received for event: ${eventType}`,
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "An error occurred processing the webhook",
    });
  }
};
