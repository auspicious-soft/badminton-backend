import { Request, Response } from "express";
import crypto from "crypto";
import { transactionModel } from "../../models/admin/transaction-schema";
import { bookingModel } from "../../models/venue/booking-schema";
import mongoose from "mongoose";
import { httpStatusCode } from "../../lib/constant";
import { configDotenv } from "dotenv";
import { bookingRequestModel } from "src/models/venue/booking-request-schema";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import { chatModel } from "src/models/chat/chat-schema";
import { orderModel } from "src/models/admin/order-schema";
import { productModel } from "src/models/admin/products-schema";
import { cartModel } from "src/models/user/user-cart";
import { notifyUser } from "src/utils/FCM/FCM";
import { usersModel } from "src/models/user/user-schema";
import { getCurrentISTTime } from "src/utils";
import { venueModel } from "src/models/venue/venue-schema";

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

      // Check if this is a merchandise order
      const notes = event.payload.payment.entity.notes || {};
      if (notes.orderId) {
        // This is a merchandise order payment
        const merchandiseOrderId = notes.orderId;
        const userId = notes.userId;

        // Start a session for transaction consistency
        const session = await mongoose.startSession();

        try {
          session.startTransaction();

          // Update the order status but DON'T set quantityUpdated yet
          const order = await orderModel.findByIdAndUpdate(
            merchandiseOrderId,
            {
              paymentStatus: "paid",
              status: "confirmed",
              razorpayPaymentId: paymentId,
              razorpayOrderId: orderId,
              paymentDate: getCurrentISTTime(), // Use utility function to get current IST time
              // Remove quantityUpdated: true from here
            },
            { new: true, session }
          );

          if (!order) {
            console.error(`Order not found for ID: ${merchandiseOrderId}`);
            await session.abortTransaction();
            return res.status(httpStatusCode.OK).json({
              success: false,
              message: "Order not found, but acknowledging webhook",
            });
          }

          // Only update quantities if they haven't been updated yet
          if (!order.quantityUpdated) {
            await transactionModel.create({
              userId,
              orderId: merchandiseOrderId,
              razorpayPaymentId: paymentId,
              razorpayOrderId: orderId,
              amount,
              text: "Merchandise order payment",
              status,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // Create notification for merchandise order payment
            await notifyUser({
              recipientId: userId,
              type: "ORDER_PLACED",
              title: "Order Placed Successfully",
              message: `Your payment of ₹${amount} for merchandise order has been successfully processed.`,
              category: "PAYMENT",
              notificationType: "BOTH",
              referenceId: merchandiseOrderId,
              priority: "HIGH",
              referenceType: "orders",
              metadata: {
                orderId: merchandiseOrderId,
                paymentId,
                amount,
              },
              session,
            });

            // Update product quantities
            await Promise.all(
              order.items.map(async (item: any) => {
                await productModel.findByIdAndUpdate(
                  item.productId,
                  {
                    $inc: {
                      "venueAndQuantity.$[venue].quantity": -item.quantity,
                    },
                  },
                  {
                    arrayFilters: [{ "venue.venueId": order.venueId }],
                    session,
                  }
                );

                // Remove this item from the user's cart
                await cartModel.deleteOne(
                  {
                    userId: order.userId,
                    productId: item.productId,
                  },
                  { session }
                );
              })
            );

            // Mark quantities as updated AFTER updating the quantities
            await orderModel.findByIdAndUpdate(
              merchandiseOrderId,
              { quantityUpdated: true },
              { session }
            );
          }

          await session.commitTransaction();

          console.log(
            `Merchandise order ${merchandiseOrderId} payment processed successfully`
          );

          // Continue with the rest of the webhook processing
        } catch (error) {
          await session.abortTransaction();
          console.error("Error processing merchandise order payment:", error);
          throw error;
        } finally {
          session.endSession();
        }
      }

      // Check if this transaction has already been processed
      const existingTransaction = await transactionModel.findOne({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        isWebhookVerified: true,
      });

      if (existingTransaction) {
        console.log(`Transaction ${paymentId} already processed, skipping`);

        await notifyUser({
          recipientId: (existingTransaction as any).userId,
          type: "PAYMENT_ALREADY_PROCESSED",
          title: "Payment Already Processed",
          message: `Your payment of ₹${amount} for order this has already been processed.`,
          category: "PAYMENT",
          referenceId: (existingTransaction as any)._id.toString(),
          priority: "MEDIUM",
          notificationType: "PUSH",
          referenceType: "transactions",
          metadata: {
            orderId,
            paymentId,
            amount,
          },
        });
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
              const groupImage = await venueModel.findById(
                booking.venueId,
                "image"
              );
              await chatModel.create({
                bookingId: booking._id,
                chatType: "group",
                groupName: `Match on ${booking.bookingDate.toLocaleDateString()}`,
                groupImage: groupImage?.image || "",
                // groupName: `Booking Chat - ${booking._id}`,
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
            // Send notifications to all players in the booking
            const allPlayerIds = [
              booking.userId,
              ...booking.team1.map((player: any) => player.playerId),
              ...booking.team2.map((player: any) => player.playerId),
            ];
            await Promise.all(
              allPlayerIds
                .filter(
                  (playerId) =>
                    playerId.toString() !== transaction.userId.toString()
                )
                .map((playerId) =>
                  notifyUser({
                    recipientId: playerId,
                    type: "PAYMENT_SUCCESSFUL",
                    title: "Game Booked Successfully",
                    message: `You are added to a new game.`,
                    category: "PAYMENT",
                    notificationType: "BOTH",
                    referenceId: (booking as any)._id.toString(),
                    priority: "MEDIUM",
                    referenceType: "bookings",
                    metadata: {
                      bookingId: booking._id,
                      transactionId: transaction._id,
                      amount: transaction.amount,
                      timestamp: new Date().toISOString(),
                    },
                    session,
                  })
                )
            );

            await notifyUser({
              recipientId: transaction.userId,
              type: "PAYMENT_SUCCESSFUL",
              title: "Game Booked Successfully",
              message: `Your payment of ₹${transaction.amount} for booking has been successfully processed.`,
              category: "PAYMENT",
              notificationType: "BOTH",
              referenceId: (booking as any)._id.toString(),
              priority: "HIGH",
              referenceType: "bookings",
              metadata: {
                bookingId: booking._id,
                transactionId: transaction._id,
                amount: transaction.amount,
                timestamp: new Date().toISOString(),
              },
              session,
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
                rackets: transaction.notes.rackets || 0,
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

              // Get the new player's details
              const newPlayer = await usersModel
                .findById(transaction.userId)
                .select("fullName profilePic")
                .lean();

              if (!newPlayer) {
                console.error(`User not found for ID: ${transaction.userId}`);
              }

              // Get all existing players in the booking
              const existingPlayerIds = [
                ...booking.team1
                  .map((player: any) => player.playerId?.toString())
                  .filter(Boolean),
                ...booking.team2
                  .map((player: any) => player.playerId?.toString())
                  .filter(Boolean),
              ];

              // Remove the new player from the list (to avoid sending notification to themselves)
              const otherPlayerIds = existingPlayerIds.filter(
                (id) => id !== transaction.userId.toString()
              );

              // Add booking owner to notification recipients if not already included
              if (
                booking.userId.toString() !== transaction.userId.toString() &&
                !otherPlayerIds.includes(booking.userId.toString())
              ) {
                otherPlayerIds.push(booking.userId.toString());
              }

              // Send notifications to all existing players about the new player joining
              if (newPlayer) {
                const teamName =
                  requestedTeam === "team1" ? "Team 1" : "Team 2";
                const positionName =
                  requestedPosition.charAt(0).toUpperCase() +
                  requestedPosition.slice(1);

                // Send notifications to all existing players
                await Promise.all(
                  otherPlayerIds.map(async (playerId) => {
                    try {
                      await notifyUser({
                        recipientId: playerId,
                        type: "PLAYER_JOINED_GAME",
                        title: "New Player Joined",
                        message: `${newPlayer.fullName} has joined your game as ${positionName} in ${teamName}.`,
                        category: "GAME",
                        notificationType: "BOTH",
                        referenceId: bookingId,
                        referenceType: "bookings",
                        priority: "HIGH",
                        metadata: {
                          bookingId,
                          newPlayerId: transaction.userId,
                          newPlayerName: newPlayer.fullName,
                          newPlayerPosition: requestedPosition,
                          newPlayerTeam: requestedTeam,
                          timestamp: new Date().toISOString(),
                        },
                        session,
                      });
                    } catch (error) {
                      console.error(
                        `Failed to send notification to player ${playerId}:`,
                        error
                      );
                    }
                  })
                );
              }

              // Update chat group to include the new player
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
        await Promise.all(
          transaction.bookingId.map(async (bookingId) => {
            const booking = await bookingModel.findById(bookingId);
            if (booking) {
              try {
                await notifyUser({
                  recipientId: booking.userId,
                  type: "PAYMENT_FAILED",
                  title: "Payment Failed",
                  priority: "HIGH",
                  notificationType: "BOTH",
                  message: `Your payment of ₹${transaction.amount} for booking has failed. Reason: ${failureReason}. Please try again.`,
                  category: "PAYMENT",
                });
              } catch (err) {
                console.error(
                  `Failed to send notification for booking ${bookingId}:`,
                  err
                );
              }
            }
          })
        );
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

      await transactionModel.create({
        userId: transaction.userId,
        orderId: transaction.orderId,
        razorpayPaymentId: paymentId,
        refundId: refundId,
        method: transaction.method,
        amount,
        text: "Booking cancelled by creator",
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // await transactionModel.findByIdAndUpdate(transaction._id, {
      //   refundId,
      //   refundedAmount: amount,
      //   status: status === "refunded" ? "refunded" : transaction.status,
      // });

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
            await notifyUser({
              recipientId: booking.userId,
              type: "REFUND_COMPLETED",
              priority: "HIGH",
              notificationType: "BOTH",
              title: "Refund Completed",
              message: `Your refund of ₹${amount} for booking has been processed successfully.`,
              category: "PAYMENT",
              session,
            });

            // Update team1 players
            for (const playerId of paidForPlayerIds) {
              await bookingModel.findByIdAndUpdate(booking._id, {
                $addToSet: { team1: playerId },
              });
            }
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
            await notifyUser({
              recipientId: booking.userId,
              type: "REFUND_FAILED",
              priority: "HIGH",
              notificationType: "BOTH",
              title: "Refund Failed",
              message: `Your refund of ₹${amount} for booking has failed. Please contact support for assistance.`,
              category: "PAYMENT",
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
