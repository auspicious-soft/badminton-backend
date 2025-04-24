import { adminModel } from "../../models/admin/admin-schema";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { FIXED_FACILITIES, httpStatusCode } from "../../lib/constant";
import { queryBuilder } from "../../utils";
import { sendPasswordResetEmail } from "src/utils/mails/mail";
import {
  generatePasswordResetToken,
  getPasswordResetTokenByToken,
  generatePasswordResetTokenByPhone,
} from "src/utils/mails/token";
import { passwordResetTokenModel } from "src/models/password-token-schema";
import { usersModel } from "src/models/user/user-schema";
import {
  EmployeeDocument,
  employeesModel,
} from "src/models/employees/employee-schema";
import { hashPasswordIfEmailAuth } from "src/utils/userAuth/signUpAuth";
import { customAlphabet } from "nanoid";
import { attendanceModel } from "src/models/employees/attendance-schema";
import mongoose from "mongoose";
import { venueModel } from "src/models/venue/venue-schema";
import { bookingModel } from "src/models/venue/booking-schema";

const sanitizeUser = (user: any): EmployeeDocument => {
  const sanitized = user.toObject();
  delete sanitized.password;
  delete sanitized.otp;
  return sanitized;
};

export const loginService = async (payload: any, res: Response) => {
  const { email, password } = payload;
  console.log("email: ", email);
  const countryCode = "+45";
  const toNumber = Number(email);
  const isEmail = isNaN(toNumber);
  let user: any = null;

  if (isEmail) {
    console.log("isEmail: ", isEmail);
    const checkAdmin = await adminModel
      .findOne({ email: email })
      .select("+password");
    const checkEmployee = await employeesModel
      .findOne({ email: email })
      .select("+password");
    user = checkAdmin || checkEmployee;
    console.log("user: ", user);
  }

  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return errorResponseHandler(
      "Invalid password",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }
  const userObject = user.toObject();
  delete userObject.password;

  if (user.role === "employee") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await attendanceModel.findOne({
      employeeId: user._id,
      date: today,
    });

    if (!existingAttendance) {
      await attendanceModel.create({
        employeeId: user._id,
        date: today,
        status: "Present",
        checkInTime: new Date(),
      });
    }
  }

  return {
    success: true,
    message: "Login successful",
    data: {
      user: userObject,
    },
  };
};

export const logoutService = async (payload: any, res: Response) => {
  const { id: employeeId } = payload;

  if (!employeeId) {
    return errorResponseHandler(
      "Employee ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of the day

  // Find today's attendance record
  const attendanceRecord = await attendanceModel.findOne({
    employeeId,
    date: today,
  });

  if (!attendanceRecord) {
    return errorResponseHandler(
      "No attendance record found for today",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (attendanceRecord.checkOutTime) {
    return errorResponseHandler(
      "Employee has already checked out",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  attendanceRecord.checkOutTime = new Date();
  await attendanceRecord.save();

  return {
    success: true,
    message: "Logout successful, check-out time recorded",
    data: { checkOutTime: attendanceRecord.checkOutTime },
  };
};

export const forgotPasswordService = async (email: string, res: Response) => {
  const admin = await adminModel.findOne({ email: email }).select("+password");
  if (!admin)
    return errorResponseHandler(
      "Email not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  const passwordResetToken = await generatePasswordResetToken(email, null);
  console.log("passwordResetToken: ", passwordResetToken);
  if (passwordResetToken !== null) {
    await sendPasswordResetEmail(email, passwordResetToken.token, "eng");
    return { success: true, message: "Password reset email sent with otp" };
  }
};

export const newPassswordAfterOTPVerifiedService = async (
  payload: { password: string; otp: string },
  res: Response
) => {
  const { password, otp } = payload;

  const existingToken = await getPasswordResetTokenByToken(otp);
  if (!existingToken)
    return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired)
    return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);

  let existingAdmin: any;

  if (existingToken.email) {
    existingAdmin = await adminModel.findOne({ email: existingToken.email });
  } else if (existingToken.phoneNumber) {
    existingAdmin = await adminModel.findOne({
      phoneNumber: existingToken.phoneNumber,
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const response = await adminModel.findByIdAndUpdate(
    existingAdmin._id,
    { password: hashedPassword },
    { new: true }
  );
  await passwordResetTokenModel.findByIdAndDelete(existingToken._id);

  return {
    success: true,
    message: "Password updated successfully",
    data: response,
  };
};

export const createEmployeeService = async (payload: any, res: Response) => {
  console.log("Create Employee", payload);
  const emailExists = await employeesModel.findOne({ email: payload.email });
  if (emailExists)
    return errorResponseHandler(
      "Email already exists",
      httpStatusCode.BAD_REQUEST,
      res
    );

  payload.password = await hashPasswordIfEmailAuth(payload, "Email");
  const identifier = customAlphabet("0123456789", 5);
  payload.identifier = identifier();

  const response = await employeesModel.create(payload);
  return {
    success: true,
    message: "Employee created successfully",
    data: sanitizeUser(response),
  };
};

export const updateEmployeeService = async (payload: any, res: Response) => {
  const employee = await employeesModel.findById({ _id: payload?.id });
  if (!employee)
    return errorResponseHandler(
      "Employee not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  if (payload?.password) {
    payload.password = await hashPasswordIfEmailAuth(payload, "Email");
  }
  const updatedUser = await employeesModel.findByIdAndUpdate(
    payload.id,
    { ...payload },
    { new: true }
  );
  return {
    success: true,
    message: "User updated successfully",
    data: sanitizeUser(updatedUser),
  };
};

export const getEmployeesService = async (payload: any, res: Response) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 10;
  const offset = (page - 1) * limit;

  let searchQuery = {};
  if (payload.search) {
    const searchRegex = new RegExp(payload.search, "i");
    searchQuery = {
      $or: [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ],
    };
  }

  if (payload.status) {
    searchQuery = {
      ...searchQuery,
      status: payload.status,
    };
  }

  const sortBy = {} as any;

  if (payload.sortBy === "fullName") {
    sortBy.fullName = 1;
  } else {
    sortBy.createdAt = -1;
  }

  const totalEmployees = await employeesModel.countDocuments();

  const employees = await employeesModel
    .find(searchQuery, "-password -otp")
    .skip(offset)
    .limit(limit)
    .sort(sortBy);

  return {
    success: true,
    message: "All users retrieved successfully",
    data: employees,
    meta: {
      total: totalEmployees,
      hasPreviousPage: page > 1,
      hasNextPage: offset + limit < totalEmployees,
      page,
      limit,
      totalPages: Math.ceil(totalEmployees / limit),
    },
  };
};

export const getEmployeeByIdService = async (payload: any, res: Response) => {
  try {
    const employeeData = await employeesModel.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(payload.id) } },
      {
        $lookup: {
          from: "attendances",
          localField: "_id",
          foreignField: "employeeId",
          as: "attendanceRecords",
        },
      },
      { $project: { password: 0, otp: 0, token: 0 } },
    ]);

    if (!employeeData.length) {
      return errorResponseHandler(
        "Employee not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    return {
      success: true,
      data: employeeData[0],
    };
  } catch (error) {
    return errorResponseHandler(
      "Something went wrong",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const getAdminDetailsService = async (payload: any, res: Response) => {
  const results = await adminModel.find();
  return {
    success: true,
    data: results,
  };
};

// ******************** Handle Venue **************************

export const createVenueService = async (payload: any, res: Response) => {
  console.log("venue-data", payload.employees);

  const missingFields = [];

  if (!payload.employees.length) missingFields.push("employees");
  if (!payload.gamesAvailable.length) missingFields.push("gamesAvailable");
  if (!payload.courts.length) missingFields.push("courts");
  if (!payload.facilities.length) missingFields.push("facilities");

  if (missingFields.length) {
    return errorResponseHandler(
      `The following fields are required: ${missingFields.join(", ")}`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const result = await venueModel.create(payload);

  return {
    success: true,
    message: "Venue created successfully",
    data: result,
  };
};

export const updateVenueService = async (payload: any, res: Response) => {
  interface UpdateVenuePayload {
    _id: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    image?: string;
    isActive?: boolean;
    gamesAvailable?: string[];
    facilities?: { name: string; isActive: boolean }[];
    courts?: { name: string; isActive: boolean; games: string }[];
    employees?: { employeeId: string; isActive: boolean }[];
    location?: any;
  }

  const {
    _id: venueId,
    name,
    address,
    city,
    state,
    image,
    gamesAvailable,
    facilities,
    courts,
    employees,
    isActive,
    location
  } = payload as UpdateVenuePayload;

  if (!venueId || !mongoose.Types.ObjectId.isValid(venueId)) {
    return errorResponseHandler(
      "Valid Venue ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const venue = await venueModel.findById(venueId);
  if (!venue) {
    return errorResponseHandler(
      "Venue not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // **Update Basic Fields**
  if (name) venue.name = name;
  if (address) venue.address = address;
  if (city) venue.city = city;
  if (state) venue.state = state;
  if (image) venue.image = image;
  if (location) venue.location = location;
  if (typeof isActive === "boolean") venue.isActive = isActive;
  if (gamesAvailable) {
    venue.gamesAvailable = gamesAvailable.map(
      (game) => game as "Padel" | "Pickleball"
    );
  }

  // **Replace Facilities, Courts, and Employees with New Data**
  if (facilities) {
    venue.facilities = facilities.map((facility) => ({
      name: facility.name as
        | "Free Parking"
        | "Paid Parking"
        | "Locker Rooms & Changing Area"
        | "Rental Equipments"
        | "Restrooms & Showers",
      isActive: facility.isActive,
    }));
  }

  if (courts) {
    venue.courts = courts.map((court) => ({
      ...court,
      games: court.games as "Padel" | "Pickleball",
    }));
  }

  if (employees) {
    venue.employees = employees.map((emp) => ({
      employeeId: new mongoose.Types.ObjectId(emp.employeeId),
      isActive: emp.isActive,
    }));
  }

  await venue.save();

  return {
    success: true,
    message: "Venue updated successfully",
    data: venue,
  };
};

export const getVenueService = async (payload: any, res: Response) => {
  const { page, limit, search } = payload;
  const pageNumber = parseInt(page) || 1;
  const limitNumber = parseInt(limit) || 10;
  const offset = (pageNumber - 1) * limitNumber;

  const searchQuery = search
    ? {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { state: { $regex: search, $options: "i" } },
          { city: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const totalVenues = await venueModel.countDocuments(searchQuery);
  const venues = await venueModel
    .find(searchQuery)
    .skip(offset)
    .limit(limitNumber)
    .sort({ createdAt: -1 })
    .select("name state city image");

  return {
    data: venues,
    meta: {
      total: totalVenues,
      hasPreviousPage: pageNumber > 1,
      hasNextPage: offset + limitNumber < totalVenues,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(totalVenues / limitNumber),
    },
  };
};

export const getVenueByIdService = async (payload: any, res: Response) => {
  const { id, search } = payload;
  console.log("venueId: ", id);

  if (!id) {
    return errorResponseHandler(
      "Venue ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const venue = await venueModel
    .findById(id)
    .populate({
      path: "employees.employeeId",
      select: "fullName email phoneNumber",
      model: "employees",
    })
    .lean();

  if (!venue) {
    return errorResponseHandler(
      "Venue not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Modify employees structure
  if (venue.employees) {
    (venue.employees as any) = venue.employees.map((emp: any) => ({
      employeeId: emp.employeeId?._id,
      isActive: emp.isActive,
      employeeData: emp.employeeId
        ? {
            fullName: emp.employeeId.fullName,
            email: emp.employeeId.email,
            phoneNumber: emp.employeeId.phoneNumber,
          }
        : null,
    }));
  }

  // Get completed bookings with player details
  const completedBookings = await bookingModel.aggregate([
    {
      $match: {
        venueId: new mongoose.Types.ObjectId(id),
        bookingPaymentStatus: true
      }
    },
    // Lookup for team1 players
    {
      $lookup: {
        from: "users",
        let: { team1Players: "$team1.playerId" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$team1Players"] }
            }
          },
          {
            $project: {
              fullName: 1,
              email: 1,
              phoneNumber: 1,
              profileImage: 1
            }
          }
        ],
        as: "team1Players"
      }
    },
    // Lookup for team2 players
    {
      $lookup: {
        from: "users",
        let: { team2Players: "$team2.playerId" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$team2Players"] }
            }
          },
          {
            $project: {
              fullName: 1,
              email: 1,
              phoneNumber: 1,
              profileImage: 1
            }
          }
        ],
        as: "team2Players"
      }
    },
    // Project fields and combine players
    {
      $project: {
        bookingDate: 1,
        bookingSlots: 1,
        players: {
          $concatArrays: ["$team1Players", "$team2Players"]
        }
      }
    },
    // If search is provided, filter matches where at least one player matches
    ...(search ? [
      {
        $match: {
          players: {
            $elemMatch: {
              fullName: { $regex: search, $options: "i" }
            }
          }
        }
      }
    ] : []),
    // Sort by booking date (newest first)
    {
      $sort: { bookingDate: -1 }
    }
  ]);

  // Add matches to venue data
  const matches = completedBookings.map(booking => ({
    bookingDate: booking.bookingDate,
    bookingSlots: booking.bookingSlots,
    players: booking.players.map((player: any) => ({
      fullName: player.fullName,
      email: player.email,
      phoneNumber: player.phoneNumber,
      profileImage: player.profileImage
    }))
  }));

  return {
    success: true,
    message: "Venue retrieved successfully",
    data: {...venue, matches}
  };
};
