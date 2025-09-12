import { Request, Response } from "express";
import { formatZodErrors } from "../../validation/format-zod-errors";
import {
  loginService,
  newPassswordAfterOTPVerifiedService,
  forgotPasswordService,
  createEmployeeService,
  updateEmployeeService,
  getEmployeesService,
  getEmployeeByIdService,
  logoutService,
  getAdminDetailsService,
  createVenueService,
  updateVenueService,
  getVenueService,
  getVenueByIdService,
  updateAdminDetailsServices,
  getUsersService,
  getUsersByIdService,
  getMatchesService,
  getCitiesService,
  dashboardServices,
  employeeDashboardServices,
  cancelMatchServices,
  venueBookingFileServices,
  createMatchService,
  availableCourtSlotServices,
  addRentedItemsServices,
} from "../../services/admin/admin-service";
import {
  errorParser,
  formatErrorResponse,
} from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { usersModel } from "src/models/user/user-schema";

export const login = async (req: Request, res: Response) => {
  try {
    const response = await loginService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const response = await forgotPasswordService(req.body.username, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const newPassswordAfterOTPVerified = async (
  req: Request,
  res: Response
) => {
  try {
    const response = await newPassswordAfterOTPVerifiedService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// ******************** Handle Employees **************************

export const createEmployee = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const response = await createEmployeeService(req.body, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const response = await updateEmployeeService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getEmployees = async (req: Request, res: Response) => {
  try {
    const response = await getEmployeesService(req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    return formatErrorResponse(res, error);
  }
};

export const getEmployeesById = async (req: Request, res: Response) => {
  try {
    const response = await getEmployeeByIdService(req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getAdminDetails = async (req: Request, res: Response) => {
  try {
    const response = await getAdminDetailsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateAdminDetails = async (req: Request, res: Response) => {
  try {
    const response = await updateAdminDetailsServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const logoutEmployee = async (req: Request, res: Response) => {
  try {
    const response = await logoutService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// ******************** Handle Venue **************************

export const createVenue = async (req: Request, res: Response) => {
  try {
    const response = await createVenueService(req.body, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateVenue = async (req: Request, res: Response) => {
  try {
    const response = await updateVenueService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getVenue = async (req: Request, res: Response) => {
  try {
    const response = await getVenueService(req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getVenueById = async (req: Request, res: Response) => {
  try {
    const response = await getVenueByIdService(req.query, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

//******************** Handle Users ************************* */

export const getUsers = async (req: Request, res: Response) => {
  try {
    const response = await getUsersService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getUsersById = async (req: Request, res: Response) => {
  try {
    const response = await getUsersByIdService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const blockUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await usersModel.findById(id);

    await usersModel.findByIdAndUpdate(
      id,
      { isBlocked: !user?.isBlocked, permanentBlackAfter: new Date() },
      { new: true }
    );

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "User block status updated successfully",
      data: [],
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

//******************** Handle Matches *************************

export const getMatches = async (req: Request, res: Response) => {
  try {
    const response = await getMatchesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const addRentedItems = async (req: Request, res: Response) => {
  try {
    const response = await addRentedItemsServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const createMatch = async (req: Request, res: Response) => {
  try {
    const response = await createMatchService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const availableCourtSlot = async (req: Request, res: Response) => {
  try {
    const response = await availableCourtSlotServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getCities = async (req: Request, res: Response) => {
  try {
    const response = await getCitiesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const cancelMatch = async (req: Request, res: Response) => {
  try {
    const response = await cancelMatchServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const dashboard = async (req: Request, res: Response) => {
  try {
    const response = await dashboardServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const employeeDashboard = async (req: Request, res: Response) => {
  try {
    const response = await employeeDashboardServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const venueBookingFile = async (req: Request, res: Response) => {
  try {
    const response = await venueBookingFileServices(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
