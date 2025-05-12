import { Router } from "express";
import {
  createEmployee,
  createVenue,
  getAdminDetails,
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
  getInventory,
  getProductById,
  getProducts,
  updateProduct,
} from "src/controllers/admin/product-controller";

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

//Products routes
router.route("/products").post(createProduct).get(getProducts);
router.route("/products/:id").patch(updateProduct).get(getProductById).put(addQuantityToProduct);

//Inventory routes
router.route("/inventory").get(getInventory).post(createInventory);

export { router };
