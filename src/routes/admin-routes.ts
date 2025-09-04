import { Router } from "express";
import {
  availableCourtSlot,
  cancelMatch,
  createEmployee,
  createMatch,
  createVenue,
  dashboard,
  employeeDashboard,
  getAdminDetails,
  getCities,
  getEmployees,
  getEmployeesById,
  getMatches,
  getUsers,
  getUsersById,
  getVenue,
  getVenueById,
  logoutEmployee,
  updateAdminDetails,
  updateEmployee,
  updateVenue,
  venueBookingFile,
} from "../controllers/admin/admin-controller";
import { createUpdateCourt } from "src/controllers/admin/court-controller";
import {
  addQuantityToProduct,
  createInventory,
  createProduct,
  deleteInventory,
  getInventory,
  getOrders,
  getProductById,
  getProducts,
  updateInventory,
  updateOrderStatus,
  updateProduct,
} from "src/controllers/admin/product-controller";
import {
  createPackage,
  createUpdateAdminSettings,
  createUpdatePricing,
  deletePackage,
  getAdminSettings,
  getAllPricing,
  getNotifications,
  getPackage,
  getTemplates,
  getUsersForPush,
  readNotification,
  rewardsSettings,
  sendPushToUsers,
  updatePackage,
  updateRewardsSettings,
} from "src/controllers/admin/settings-controller";
import {
  createMaintenanceBooking,
  deleteMaintenanceBooking,
  getMaintenanceBookings,
  listOfCourts,
  listOfVenues,
  updateMaintenanceBooking,
} from "src/controllers/admin/maintenance-controller";

const router = Router();

router.get("/dashboard", dashboard);
router.get("/dashboard-emp", employeeDashboard);

router.get("/venue-booking-file/:id", venueBookingFile);

//Emmpoyee routes

router.post("/create-employee", createEmployee);
router.put("/update-employee", updateEmployee);
router.get("/get-employees", getEmployees);
router.get("/get-employees-by-id", getEmployeesById);
router.post("/logout-employee", logoutEmployee);
router.get("/get-admin-details", getAdminDetails);
router.put("/update-admin-details", updateAdminDetails);

//Courts routes
router.post("/court", createUpdateCourt);
router.patch("/court/:id", createUpdateCourt);

//Venue routes
router.post("/create-venue", createVenue);
router.put("/update-venue", updateVenue);
router.get("/get-venues", getVenue);
router.get("/get-venue-by-id", getVenueById);

//Users routes
router.get("/get-users", getUsers);
router.get("/get-users/:id", getUsersById);

//Matches routes
router.get("/get-matches", getMatches);
router.post("/create-match", createMatch);
router.get("/available-court-slots", availableCourtSlot);
router.get("/get-cities", getCities);

router.post("/cancel-match", cancelMatch);

//Products routes
router.route("/products").post(createProduct).get(getProducts);
router
  .route("/products/:id")
  .patch(updateProduct)
  .get(getProductById)
  .put(addQuantityToProduct);

//Inventory routes
router
  .route("/inventory")
  .get(getInventory)
  .post(createInventory)
  .put(updateInventory)
  .delete(deleteInventory);

//Dynamic Pricing routes
router.route("/dynamic-pricing").post(createUpdatePricing).get(getAllPricing);

//Maintenance routes
router.post("/maintenance-booking", createMaintenanceBooking);
router.get("/maintenance-booking", getMaintenanceBookings);
router.put("/maintenance-booking/:id", updateMaintenanceBooking);
router.delete("/maintenance-booking/:id", deleteMaintenanceBooking);
router.get("/venue-list", listOfVenues);
router.get("/court-list", listOfCourts);

//Admin Settings routes
router
  .route("/admin-settings")
  .post(createUpdateAdminSettings)
  .get(getAdminSettings);
router
  .route("/reward-settings/:type")
  .get(rewardsSettings)
  .put(updateRewardsSettings);
router.route("/packages").get(getPackage).post(createPackage).put(updatePackage).delete(deletePackage)

//Orders
router.route("/orders").get(getOrders).put(updateOrderStatus);
router.route("/notifications").get(getNotifications).post(readNotification);
router
  .route("/custome-notification")
  .get(getUsersForPush)
  .post(sendPushToUsers);

router.route("/get-templates").get(getTemplates)

router.get("/get-venues", getVenues);
router.get("/get-courts", getCourts);

router.post("/test", async (req: Request, res: Response)=> {
  sendInvoiceToUser(req.body.userId, req.body.bookingId)
  return{}
})

//Test Route to create playcoin plans

import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { playcoinModel } from "src/models/admin/playcoin-schema";
import {
  getCourts,
  getVenues,
} from "src/controllers/user/user-home-controller";
import { sendInvoiceToUser } from "src/utils";

router.post("/playcoin-plans", async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    await playcoinModel.create({
      ...req.body,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Users notified successfully",
    });
  } catch (error: any) {
    const { code, message } = error;
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
});

export { router };
