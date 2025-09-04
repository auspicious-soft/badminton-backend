import { Router } from "express";
import {
  getMatchesById,
  getMyMatches,
  getMyTransactions,
  uploadScore,
} from "src/controllers/user/booking-controller";
import {
  acceptFriendRequest,
  blockUser,
  getFriends,
  getFriendsById,
  searchFriend,
  sendRequest,
} from "src/controllers/user/friend-controller";
import {
  addToCart,
  deleteCartItem,
  editCart,
  getCart,
  getMerchandise,
  getMerchandiseById,
  getMyOrders,
  getOrderById,
  orderProduct,
  rateProduct,
} from "src/controllers/user/merchandise-controller";
import {
  bookCourt,
  bookingPayment,
  cancelBooking,
  clubStatus,
  createGuest,
  getAppInfo,
  getCourts,
  getDynamicPrice,
  getOpenMatches,
  getOpenMatchesById,
  getUser,
  getVenues,
  joinOpenCourt,
  modifyBooking,
  readUserNotifications,
  submitPhone,
  updateUser,
  userHome,
  userNotifications,
  verifyPhoneNumber,
} from "src/controllers/user/user-home-controller";
import { validateBookingRequest } from "src/middleware/booking-validation";
import { uploadUserImageController } from "src/controllers/user/user-controller";
import { buyPackages, deleteAccount, getPackages, getTutorialLink, logout } from "src/controllers/user/settings-controller";

const router = Router();

router.get("/get-user", getUser);
router.put("/update-user", updateUser);
router.get("/user-home-screen", userHome);
router.get("/submit-phone", submitPhone)
router.post("/verify-phone", verifyPhoneNumber)
router.post("/club-status", clubStatus);

router.get("/get-venues", getVenues);
router.get("/get-courts", getCourts);
router.get("/get-booking-data-byId", getCourts);
router.post("/create-guest", createGuest)
router.post("/book-court", validateBookingRequest, bookCourt);
router.put("/modify-booking/:id", modifyBooking);
router.post("/booking-payment", bookingPayment);
router.get("/get-dynamic-price", getDynamicPrice);
router.post("/cancel-booking", cancelBooking);

router.get("/get-open-matches", getOpenMatches);
router.get("/open-matches-data-byId/:id", getOpenMatchesById);
router.post("/join-open-matches", joinOpenCourt);
router.get("/my-matches", getMyMatches);
router.get("/my-matches/:id", getMatchesById);
router.post("/upload-score", uploadScore);

router
  .route("/user-notifications")
  .get(userNotifications)
  .post(readUserNotifications);

router.get("/search-friend", searchFriend);
router.post("/send-request", sendRequest);
router.post("/request-action", acceptFriendRequest);
router.post("/block-user", blockUser);
router.get("/get-friends", getFriends);
router.get("/get-friends-byId/:id", getFriendsById);

router
  .route("/merchandise")
  .get(getMerchandise)
  .post(orderProduct)
  .put(rateProduct);
router.route("/get-orders").get(getMyOrders);
router.route("/get-orders/:id").get(getOrderById);
router.route("/merchandise/:id").get(getMerchandiseById);
router
  .route("/cart")
  .get(getCart)
  .post(addToCart)
  .put(editCart)
  .delete(deleteCartItem);

router.get("/user-transactions", getMyTransactions);
router.get("/application-info", getAppInfo);
router.route("/packages").get(getPackages).post(buyPackages);

// router.post("/upload-image", upload.single('image'), uploadUserImageController);
router.post("/upload-image", uploadUserImageController);
router.post("/logout", logout);
router.get("/delete-account", deleteAccount);
router.get("/get-tutorial", getTutorialLink);

export { router };
