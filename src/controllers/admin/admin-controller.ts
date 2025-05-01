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
} from "../../services/admin/admin-service";
import { errorParser } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";

export const login = async (req: Request, res: Response) => {
  try {
    const response = await loginService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
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

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const response = await createEmployeeService(req.body, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
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
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
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
    const response = await logoutService(req.body, res);
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

