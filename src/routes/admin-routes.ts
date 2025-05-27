import { Router } from "express";
import {
  createEmployee,
  createVenue,
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
} from "../controllers/admin/admin-controller";
import { createUpdateCourt } from "src/controllers/admin/court-controller";
import {
  addQuantityToProduct,
  createInventory,
  createProduct,
  deleteInventory,
  getInventory,
  getProductById,
  getProducts,
  updateInventory,
  updateProduct,
} from "src/controllers/admin/product-controller";
import {
  createUpdatePricing,
  getAllPricing,
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
router.get("/get-cities", getCities);

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
router.get("/venue-list", listOfVenues)
router.get("/court-list", listOfCourts)



export { router };
