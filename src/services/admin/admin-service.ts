import { adminModel } from "../../models/admin/admin-schema";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../lib/constant";
import { sendPasswordResetEmail } from "src/utils/mails/mail";
import {
  generatePasswordResetToken,
  getPasswordResetTokenByToken,
} from "src/utils/mails/token";
import { passwordResetTokenModel } from "src/models/password-token-schema";
import {
  EmployeeDocument,
  employeesModel,
} from "src/models/employees/employee-schema";
import { hashPasswordIfEmailAuth } from "src/utils/userAuth/signUpAuth";
import { customAlphabet } from "nanoid";
import { attendanceModel } from "src/models/employees/attendance-schema";
import mongoose, { Types } from "mongoose";
import { venueModel } from "src/models/venue/venue-schema";
import { bookingModel } from "src/models/venue/booking-schema";
import { usersModel } from "src/models/user/user-schema";
import { object } from "webidl-conversions";
import { courtModel } from "src/models/venue/court-schema";
import { productModel } from "src/models/admin/products-schema";
import { generateInvoiceNumber, getCurrentISTTime } from "../../utils";
import { request } from "http";
import { transactionModel } from "src/models/admin/transaction-schema";
import { match } from "assert";
import { additionalUserInfoModel } from "src/models/user/additional-info-schema";
import razorpayInstance from "src/config/razorpay";
import { notifyUser } from "src/utils/FCM/FCM";
// import { priceModel } from "src/models/admin/price-schema";
import invoices from "razorpay/dist/types/invoices";
import { dynamicPrizeModel } from "src/models/admin/dynamic-prize-schema";

const sanitizeUser = (user: any): EmployeeDocument => {
  const sanitized = user.toObject();
  delete sanitized.password;
  delete sanitized.otp;
  return sanitized;
};

export const loginService = async (payload: any, res: Response) => {
  const { email, password } = payload;
  const countryCode = "+45";
  const toNumber = Number(email);
  const isEmail = isNaN(toNumber);
  let user: any = null;

  if (isEmail) {
    const checkAdmin = await adminModel
      .findOne({ email: email })
      .select("+password");
    const checkEmployee = await employeesModel
      .findOne({ email: email })
      .select("+password");
    user = checkAdmin || checkEmployee;
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

  userObject.venueId = null;

  if (user.role === "employee") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const venue = await venueModel.findOne({
      "employees.employeeId": { $in: [user._id] },
    });

    if (venue) {
      userObject.venueId = venue._id;
      userObject.venueName = venue.name;
      userObject.location = venue.location;
    }

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
  const { id: employeeId } = payload.user;

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

  // if (attendanceRecord.checkOutTime) {
  //   return errorResponseHandler(
  //     "Employee has already checked out",
  //     httpStatusCode.BAD_REQUEST,
  //     res
  //   );
  // }
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
  const emailExists = await employeesModel.findOne({ email: payload.email });
  if (emailExists)
    return errorResponseHandler(
      "Email already exists",
      httpStatusCode.BAD_REQUEST,
      res
    );

  // Set fullName if firstName and lastName are provided
  if (!payload.fullName && (payload.firstName || payload.lastName)) {
    payload.fullName = `${payload.firstName || ""} ${
      payload.lastName || ""
    }`.trim();
  }

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
  const order = payload.order || "desc";
  const status = payload.status || ""; // Remove default "Working" status
  const free = payload.free || null; // Default to false if not provided
  const sortBy =
    payload.sortBy === "fullName" || payload.sortBy === "createdAt"
      ? payload.sortBy
      : "createdAt";

  // Validate status if provided
  if (status && !["Working", "Ex-Employee"].includes(status)) {
    return errorResponseHandler(
      "Invalid status. Must be either 'Working' or 'Ex-Employee'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate order
  if (order && !["asc", "desc"].includes(order)) {
    return errorResponseHandler(
      "Invalid order. Must be either 'asc' or 'desc'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Build search query
  let searchQuery: any = {}; // Initialize empty search query

  // Only add status to query if it's provided
  if (status) {
    searchQuery.status = status;
  }

  if (payload.search) {
    const searchRegex = new RegExp(payload.search, "i");
    searchQuery = {
      ...searchQuery,
      $or: [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ],
    };
  }

  try {
    // Get total count based on search query
    const totalEmployees = await employeesModel.countDocuments(searchQuery);

    // Build aggregation pipeline for proper sorting
    const pipeline = [
      { $match: searchQuery },
      {
        $sort: {
          [sortBy]: order === "asc" ? 1 : -1,
        },
      },
      { $skip: offset },
      { $limit: limit },
      {
        $project: {
          password: 0,
          otp: 0,
        },
      },
    ];

    const venues = await venueModel.find({}).lean();

    // Execute aggregation with collation for case-insensitive sorting
    let employees = await employeesModel
      .aggregate(pipeline as any)
      .collation({
        locale: "en",
        strength: 2, // Case-insensitive sorting
      })
      .exec();

    employees.forEach((employee: any) => {
      let exist = venues.find((venue: any) => {
        return venue.employees.some(
          (emp: any) => emp.employeeId.toString() === employee._id.toString()
        );
      });
      if (exist) {
        employee.venueId = exist._id;
        employee.venueName = exist.name;
      }
    });

    if (free !== null) {
      employees = employees.filter((employee: any) => {
        return !employee.venueId;
      });
    }

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
        status: status || "all", // Return "all" when no status is specified
        order,
        sortBy,
      },
    };
  } catch (error) {
    console.error("Error in getEmployeesService:", error);
    return errorResponseHandler(
      "Error retrieving employees",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
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
  if (payload.currentUser.role == "admin") {
    const results = await adminModel.findById(payload.currentUser.id).lean();
    return {
      success: true,
      data: results,
    };
  }

  if (payload.currentUser.role == "employee") {
    const results = await employeesModel
      .findById(payload.currentUser.id)
      .select("-password -otp -token")
      .lean();
    if (!results) {
      return errorResponseHandler(
        "Employee not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    return {
      success: true,
      data: results,
    };
  }
  return {
    success: false,
    data: {},
  };
};

export const updateAdminDetailsServices = async (
  payload: any,
  res: Response
) => {
  try {
    const adminId = payload.currentUser.id;
    const updateFields: any = {};

    payload = payload.body;

    // Only add fields that are provided and not empty
    if (payload.fullName?.trim()) {
      updateFields.fullName = payload.fullName;
    }

    if (payload.email?.trim()) {
      const existingAdmin = await adminModel.findOne({
        email: payload.email,
        _id: { $ne: adminId },
      });

      if (existingAdmin) {
        return errorResponseHandler(
          "Email already exists",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      updateFields.email = payload.email;
    }

    if (payload.phoneNumber) {
      const existingAdmin = await adminModel.findOne({
        phoneNumber: payload.phoneNumber,
        _id: { $ne: adminId },
      });

      if (existingAdmin) {
        return errorResponseHandler(
          "Phone number already exists",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      updateFields.phoneNumber = payload.phoneNumber;
    }

    if (payload.profilePic?.trim()) {
      updateFields.profilePic = payload.profilePic;
    }

    if (payload.password) {
      updateFields.password = await hashPasswordIfEmailAuth(payload, "Email");
    }

    // If no fields to update
    if (Object.keys(updateFields).length === 0) {
      return errorResponseHandler(
        "No valid fields to update",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const updatedAdmin = await adminModel.findByIdAndUpdate(
      adminId,
      { $set: updateFields },
      { new: true, select: "-password" }
    );

    if (!updatedAdmin) {
      return errorResponseHandler(
        "Admin not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    return {
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin,
    };
  } catch (error) {
    return errorResponseHandler(
      "Error updating admin details",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// ******************** Handle Venue **************************

export const createVenueService = async (payload: any, res: Response) => {
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

  let result = await venueModel.create(payload);
  const createCourts = await courtModel.insertMany(
    payload.courts.map((court: any) => ({
      ...court,
      venueId: result._id,
    }))
  );

  return {
    success: true,
    message: "Venue created successfully",
    data: { venue: result, courts: createCourts },
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
    contactInfo?: string;
    employees?: { employeeId: string; isActive: boolean }[];
    location?: any;
    timeslots?: any;
    gstNumber?: any;
    openingHours?: any;
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
    contactInfo,
    employees,
    isActive,
    location,
    timeslots,
    openingHours,
    gstNumber,
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
  if (contactInfo) venue.contactInfo = contactInfo;
  if (image) venue.image = image;
  if (location) venue.location = location;
  if (typeof isActive === "boolean") venue.isActive = isActive;
  if (gamesAvailable) {
    venue.gamesAvailable = gamesAvailable.map(
      (game) => game as "Padel" | "Pickleball"
    );
  }
  if (timeslots) venue.timeslots = timeslots;
  if (openingHours) venue.openingHours = openingHours;
  if (gstNumber) venue.gstNumber = gstNumber;

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

  if (employees) {
    venue.employees = employees.map((emp) => ({
      employeeId: new mongoose.Types.ObjectId(emp.employeeId),
      isActive: emp.isActive,
    }));
  }

  await venue.save();

  const courts = await courtModel.find({ venueId: venue._id }).lean();

  return {
    success: true,
    message: "Venue updated successfully",
    data: { venue, courts },
  };
};

export const getVenueService = async (payload: any, res: Response) => {
  const { page, limit, search } = payload;
  const pageNumber = parseInt(page) || 1;
  const limitNumber = parseInt(limit) || 10;
  const offset = (pageNumber - 1) * limitNumber;

  const isValidSearch = (str: string) => /^[a-zA-Z0-9\s]+$/.test(str);

  if (search && !isValidSearch(search)) {
    // You can also throw an error instead of returning
    return errorResponseHandler(
      "Only letters and numbers are allowed.",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

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
      select: "fullName email phoneNumber profilePic",
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
            profilePic: emp.employeeId.profilePic,
          }
        : null,
    }));
  }

  const courts = await courtModel.find({ venueId: id }).lean();

  return {
    success: true,
    message: "Venue retrieved successfully",
    data: { venue, courts },
  };
};

//******************** Handle Users *************************

export const getUsersService = async (payload: any, res: Response) => {
  // Sorting logic at the top
  let payload2 = payload.query;
  const sortBy =
    payload2.sortBy === "fullName" || payload2.sortBy === "createdAt"
      ? payload2.sortBy
      : "fullName";
  const order =
    payload2.order === "asc" || payload2.order === "desc"
      ? payload2.order
      : "asc";

  // Log sorting parameters for debugging

  // Pagination and search parameters
  const { page, limit, search } = payload.query;
  const pageNumber = parseInt(page) || 1;
  const limitNumber = parseInt(limit) || 10;
  const offset = (pageNumber - 1) * limitNumber;

  const isValidSearch = (str: string) => /^[a-zA-Z0-9\s@]+$/.test(str);

  if (search && !isValidSearch(search)) {
    return errorResponseHandler(
      "Only letters and numbers are allowed.",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Build search query
  const searchQuery = search
    ? {
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  try {
    // Count total users for pagination
    const totalUsers = await usersModel.countDocuments(searchQuery);

    // Build aggregation pipeline
    const pipeline = [
      { $match: searchQuery },
      {
        $sort: {
          [sortBy]: order === "asc" ? 1 : -1,
        },
      },
      { $skip: offset },
      { $limit: limitNumber },
      {
        $project: {
          fullName: 1,
          email: 1,
          phoneNumber: 1,
          profilePic: 1,
          isBlocked: 1,
          createdAt: 1,
          _id: 1,
        },
      },
    ];

    // Log pipeline for debugging

    // Execute aggregation with collation for case-insensitive sorting
    const users = await usersModel
      .aggregate(pipeline as any)
      .collation({
        locale: "en",
        strength: 2, // Case-insensitive sorting
      })
      .exec();

    // Return response
    return {
      success: true,
      message: "All users retrieved successfully",
      data: users,
      meta: {
        total: totalUsers,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: offset + limitNumber < totalUsers,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalUsers / limitNumber),
        order,
        sortBy,
      },
    };
  } catch (error) {
    console.error("Error in getUsersService:", error);
    return errorResponseHandler(
      "Error retrieving users",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const getUsersByIdService = async (payload: any, res: Response) => {
  const { id } = payload.params;
  const user: any = await usersModel.findById(id).lean();
  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  delete user.token;
  delete user.password;
  delete user.otp;

  // Static stats until we don't have api from client to get all these data
  user["stats"] = {
    totalMatches: 0,
    padlelMatches: 0,
    pickleballMatches: 0,
    loyaltyPoints: 0,
    level: 0,
    lastMonthLevel: 0,
    level6MonthsAgo: 0,
    level1YearAgo: 0,
    improvement: 0,
    confidence: "10%",
  };

  // Get all bookings where this user is a player
  const bookingData = await bookingModel
    .find({
      $or: [
        { "team1.playerId": new mongoose.Types.ObjectId(id) },
        { "team2.playerId": new mongoose.Types.ObjectId(id) },
      ],
    })
    .populate("venueId", "courtId")
    .lean();

  // Process each booking to add player details
  const processedBookings = await Promise.all(
    bookingData.map(async (booking) => {
      // Process team1 players
      const team1WithUserData = await Promise.all(
        booking.team1.map(async (player: any) => {
          const userData = await usersModel
            .findById(player.playerId)
            .select("fullName profilePic")
            .lean();
          return {
            ...player,
            userData: userData || { fullName: "Unknown", profilePic: null },
          };
        })
      );

      // Process team2 players
      const team2WithUserData = await Promise.all(
        booking.team2.map(async (player: any) => {
          const userData = await usersModel
            .findById(player.playerId)
            .select("fullName profilePic")
            .lean();
          return {
            ...player,
            userData: userData || { fullName: "Unknown", profilePic: null },
          };
        })
      );

      // Get venue details
      let venueData: any = null;
      if (booking.venueId) {
        venueData = await venueModel
          .findById(booking.venueId)
          .select("name city state image courts")
          .lean();
      }

      // Get court details
      let courtData = null;
      if (booking.courtId) {
        courtData = await courtModel.findById(booking.courtId);
      }
      delete venueData.courts;

      // Return processed booking with all details
      return {
        ...booking,
        team1: team1WithUserData,
        team2: team2WithUserData,
        venue: venueData,
        court: courtData,
      };
    })
  );

  // Split into upcoming and completed matches
  const currentDate = new Date();
  const upcomingMatches = processedBookings.filter(
    (booking) => new Date(booking.bookingDate) > currentDate
  );

  const completedMatches = processedBookings.filter(
    (booking) => new Date(booking.bookingDate) < currentDate
  );

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      ...user,
      upcomingMatches: upcomingMatches || [],
      completedMatches: completedMatches || [],
    },
  };
};

//******************** Handle Matches *************************

export const getMatchesService = async (payload: any, res: Response) => {
  const {
    page,
    limit,
    city,
    type = "upcoming",
    game,
    date,
    venueId,
  } = payload.query;
  const pageNumber = parseInt(page) || 1;
  const limitNumber = parseInt(limit) || 10;
  const offset = (pageNumber - 1) * limitNumber;

  if (!["upcoming", "completed", "cancelled"].includes(type)) {
    return errorResponseHandler(
      "Invalid type. Must be either 'upcoming', 'completed' or 'cancelled'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Get current time in IST
    const currentDate = new Date().setHours(0, 0, 0, 0); // Normalize to start of the day
    const currentISTHour = getCurrentISTTime().getHours();
    const nowIST = getCurrentISTTime();
    const currentISTTimeString = nowIST.toTimeString().slice(0, 5); // "HH:mm"
    //

    let matchQuery: any = {};
    matchQuery.bookingPaymentStatus = true;

    // Handle date filter if provided in YYYY-MM-DD format
    if (date) {
      // Parse the date string and create start/end of the specified day
      const parsedDate = new Date(date);

      if (!isNaN(parsedDate.getTime())) {
        // Set to beginning of day (00:00:00)
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);

        // Set to end of day (23:59:59.999)
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Filter bookings for the specified date
        matchQuery.bookingDate = {
          $gte: startOfDay,
          $lte: endOfDay,
        };
      }
    } else {
      const nowIST = getCurrentISTTime();
      const todayStartIST = new Date(nowIST);
      todayStartIST.setHours(0, 0, 0, 0);
      const todayEndIST = new Date(nowIST);
      todayEndIST.setHours(23, 59, 59, 999);
      if (type === "upcoming") {
        matchQuery.$or = [
          {
            // Case 2: Today's booking, but time has passed
            bookingDate: {
              $gte: todayStartIST,
              $lte: todayEndIST,
            },
            bookingSlots: { $gte: currentISTTimeString },
            cancellationReason: null,
          },
          {
            // Case 1: Any booking from before today (fully completed)
            bookingDate: { $gt: todayEndIST },
            cancellationReason: null,
          },
        ];
      } else if (type === "completed") {
        matchQuery.$or = [
          {
            // Case 1: Any booking from before today (fully completed)
            bookingDate: { $lt: currentDate },
            cancellationReason: null,
          },
          {
            // Case 2: Today's booking, but time has passed
            bookingDate: {
              $gte: todayStartIST,
              $lte: todayEndIST,
            },
            bookingSlots: { $lt: currentISTTimeString },
            cancellationReason: null,
          },
        ];
      }
    }

    // Always apply cancellation filter for cancelled type
    if (type === "cancelled") {
      matchQuery.cancellationReason = { $ne: null };
    }

    // Add search query if provided
    // if (city) {
    //   // We need to first find venues with matching city
    //   const venues = await venueModel
    //     .find({
    //       city: { $regex: city, $options: "i" },
    //     })
    //     .select("_id")
    //     .lean();

    //   // Then use those venue IDs in our booking query
    //   const venueIds = venues.map((venue) => venue._id);
    //   matchQuery.venueId = { $in: venueIds };
    // }

    if (venueId) {
      // If venueId is provided, filter by that specific venue
      matchQuery.venueId = new mongoose.Types.ObjectId(venueId);
    }

    if (game) {
      matchQuery.courtId = new mongoose.Types.ObjectId(game);
    }

    // First, get all bookings without game filtering
    const bookings = await bookingModel
      .find(matchQuery)
      .populate("venueId", "name city state image")
      .populate("courtId", "name games hourlyRate image")
      .sort({ bookingDate: type === "upcoming" ? 1 : -1 })
      .lean();

    // Filter by game type if specified
    let filteredBookings = bookings;

    // Apply pagination after filtering
    const totalMatches = filteredBookings.length;
    const paginatedBookings = filteredBookings.slice(
      offset,
      offset + limitNumber
    );

    // Process each booking to add player details and remove duplication
    const processedBookings = await Promise.all(
      paginatedBookings.map(async (booking: any) => {
        // Process team1 players
        const team1WithUserData = await Promise.all(
          booking.team1.map(async (player: any) => {
            const userData = await usersModel
              .findById(player.playerId)
              .select("fullName profilePic phoneNumber")
              .lean();
            return {
              ...player,
              userData: userData || {
                fullName: "Unknown",
                profilePic: null,
                phoneNumber: null,
              },
            };
          })
        );

        // Process team2 players
        const team2WithUserData = await Promise.all(
          booking.team2.map(async (player: any) => {
            const userData = await usersModel
              .findById(player.playerId)
              .select("fullName profilePic phoneNumber")
              .lean();
            return {
              ...player,
              userData: userData || {
                fullName: "Unknown",
                profilePic: null,
                phoneNumber: null,
              },
            };
          })
        );

        // Extract venue and court data
        const venue = booking.venueId;
        const court = booking.courtId;

        // Create a clean booking object without the duplicated data
        const cleanBooking = { ...booking };

        // Remove the populated objects to avoid duplication
        delete cleanBooking.venueId;
        delete cleanBooking.courtId;

        // Return the cleaned booking with venue and court data
        return {
          ...cleanBooking,
          team1: team1WithUserData,
          team2: team2WithUserData,
          venue,
          court,
        };
      })
    );

    return {
      success: true,
      message: `${type} matches retrieved successfully`,
      data: processedBookings,
      meta: {
        total: totalMatches,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: offset + limitNumber < totalMatches,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalMatches / limitNumber),
        type,
        gameType: game, // Return the game parameter in the response
        date: date || null,
      },
    };
  } catch (error) {
    return errorResponseHandler(
      "Error retrieving matches: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const addRentedItemsServices = async (payload: any, res: Response) => {
  const {
    bookingId,
    player1 = { rackets: 0, balls: 0 },
    player2 = { rackets: 0, balls: 0 },
    player3 = { rackets: 0, balls: 0 },
    player4 = { rackets: 0, balls: 0 },
  } = payload.body;

  const booking = await bookingModel.findById(bookingId);
  if (!booking) {
    return errorResponseHandler(
      "Booking not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (booking.team1[0]) {
    booking.team1[0].rackets = player1.rackets || 0;
    booking.team1[0].balls = player1.balls || 0;
  }

  if (booking.team1[1]) {
    booking.team1[1].rackets = player2.rackets || 0;
    booking.team1[1].balls = player2.balls || 0;
  }

  if (booking.team2[0]) {
    booking.team2[0].rackets = player3.rackets || 0;
    booking.team2[0].balls = player3.balls || 0;
  }
  if (booking.team2[1]) {
    booking.team2[1].rackets = player4.rackets || 0;
    booking.team2[1].balls = player4.balls || 0;
  }

  await booking.save();

  return {
    success: true,
    message: "Rented items updated successfully",
    data: booking,
  };
};

function makeBookingDateInIST(rawDate: any, slotHour: any) {
  const hour = parseInt(slotHour, 10);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    throw new Error("Invalid slot hour: " + slotHour);
  }

  let y: number, m: number, d: number;

  if (rawDate instanceof Date) {
    y = rawDate.getFullYear();
    m = rawDate.getMonth();
    d = rawDate.getDate();
  } else if (typeof rawDate === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      const parts = rawDate.split("-").map(Number);
      y = parts[0];
      m = parts[1] - 1;
      d = parts[2];
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
      const parts = rawDate.split("/").map(Number);
      d = parts[0];
      m = parts[1] - 1;
      y = parts[2];
    } else {
      const tmp = new Date(rawDate);
      if (isNaN(tmp.getTime())) {
        throw new Error("Invalid date string: " + rawDate);
      }
      y = tmp.getFullYear();
      m = tmp.getMonth();
      d = tmp.getDate();
    }
  } else {
    throw new Error("Unsupported date input: " + rawDate);
  }

  // Instead of 5.5, handle 5h 30m separately
  const utcDate = new Date(Date.UTC(y, m, d, hour - 5, -30, 0));

  return utcDate;
}

function getTodayISTDateString() {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); // shift to IST
  return istNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export const createMatchService = async (payload: any, res: Response) => {
  const {
    player1,
    player1Email,
    player1phone,
    player2 = "Guest Player 2",
    player3 = "Guest Player 3",
    player4 = "Guest Player 4",
    venueId,
    courtId,
    bookingSlots,
    rackets = 0,
    balls = 0,
  } = payload.body;

  const now = new Date();
  const istString = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const indiaToday = `${istString}T00:00:00.000+00:00`;

  const todayIST = getTodayISTDateString();
  // Start of the day in IST
  const startOfDayIST = new Date(`${todayIST}T00:00:00+05:30`).toISOString();

  // End of the day in IST
  const endOfDayIST = new Date(`${todayIST}T23:59:59.999+05:30`).toISOString();

  const checkBookings = await bookingModel
    .find({
      bookingSlots: { $in: bookingSlots },
      bookingDate: {
        $gte: startOfDayIST,
        $lte: endOfDayIST,
      },
      bookingPaymentStatus: true,
      bookingType: { $ne: "Cancelled" },
      courtId: courtId,
    })
    .lean();

  if (checkBookings.length > 0) {
    return errorResponseHandler(
      `Slot ${checkBookings[0].bookingSlots} is already booked for today`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const dynamicPrices = await dynamicPrizeModel
    .findOne({
      date: indiaToday,
      courtId,
    })
    .select("slotPricing")
    .lean();

  const result = [] as any;

  bookingSlots.forEach((slot: any) => {
    const slotPrice =
      dynamicPrices?.slotPricing?.find((price: any) => price.slot === slot)
        ?.price || 0;
    result.push({
      slot,
      price: slotPrice,
    });
  });

  // create multiple users
  const users = [
    {
      fullName: player1,
      email: player1Email,
      phone: player1phone,
      role: "guest",
      phoneVerified: true,
      emailVerified: true,
    },
    {
      fullName: player2,
      role: "guest",
    },
    {
      fullName: player3,
      role: "guest",
    },
    {
      fullName: player4,
      role: "guest",
    },
  ];

  const createdUsers = [];

  for (const u of users) {
    if (u.email) {
      // Check if a user with the same email exists
      const existing = await usersModel.findOneAndUpdate(
        { email: u.email },
        { $set: u },
        { new: true }
      );
      if (existing) {
        createdUsers.push(existing);
        continue; // skip creation
      }
    }

    // Create if no email or email not found
    const newUser = await usersModel.create(u);
    createdUsers.push(newUser);
  }

  if (createdUsers.length !== users.length) {
    return errorResponseHandler(
      "Failed to create all users",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }

  // create booking
  const bookingData = {
    team1: [
      {
        playerId: createdUsers[0]._id,
        playerType: "player1",
        paymentStatus: "Paid",
        paidBy: "Self",
        playerPayment: 0,
        rackets,
        balls,
      },
      {
        playerId: createdUsers[1]._id,
        playerType: "player2",
        paymentStatus: "Paid",
        paidBy: "User",
      },
    ],
    team2: [
      {
        playerId: createdUsers[2]._id,
        playerType: "player3",
        paymentStatus: "Paid",
        paidBy: "User",
      },
      {
        playerId: createdUsers[3]._id,
        playerType: "player4",
        paymentStatus: "Paid",
        paidBy: "User",
      },
    ],
    userId: createdUsers[0]._id,
    bookingType: "Complete",
    venueId,
    bookingAmount: 0,
    expectedPayment: 0,
    courtId,
    bookingDate: makeBookingDateInIST(todayIST, bookingSlots[0]),
    bookingPaymentStatus: true,
    bookingSlots: null,
    invoiceNumber: "",
  };

  const finalBookingData = [];

  for (let i = 0; i < result.length; i++) {
    bookingData.bookingSlots = result[i].slot;
    bookingData.team1[0].playerPayment = result[i].price;
    bookingData.bookingAmount = result[i].price;
    bookingData.expectedPayment = result[i].price;
    bookingData.bookingDate = makeBookingDateInIST(todayIST, result[i].slot);
    bookingData.invoiceNumber = "";
    const data = await bookingModel.create(bookingData);
    finalBookingData.push(data);
  }

  await transactionModel.create({
    userId: createdUsers[0]._id,
    bookingId:
      result.length == 1
        ? [finalBookingData[0]._id]
        : [finalBookingData[0]._id, finalBookingData[1]._id],
    method: "In-Court",
    isWebhookVerified: true,
    status: "authorized",
    amount:
      result.length == 1
        ? finalBookingData[0].bookingAmount
        : finalBookingData[0].bookingAmount + finalBookingData[1].bookingAmount,
  });

  // for (let i = 0; i < finalBookingData.length; i++) {
  //   await transactionModel.create({
  //     userId: createdUsers[0]._id,
  //     bookingId: finalBookingData[i]._id,
  //     method: "In-Court",

  //     isWebhookVerified: true,
  //     status: "authorized",
  //     amount: finalBookingData[i].bookingAmount,
  //   });
  // }

  return {
    success: true,
    message: "Success",
    data: finalBookingData,
  };
};

export const availableCourtSlotServices = async (
  payload: any,
  res: Response
) => {
  const { courtId } = payload.query;
  const now = new Date();
  const istString = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const indiaToday = `${istString}T00:00:00.000+00:00`;

  const today = new Date().toISOString();
  const todayEndDate = new Date(
    new Date().setHours(23, 59, 59, 999)
  ).toISOString();

  const venue = (await courtModel
    .findById(courtId)
    .populate("venueId", "timeslots")
    .lean()) as any;
  const bookings = await bookingModel
    .find({
      courtId: courtId,
      bookingPaymentStatus: true,
      isMaintenance: false,
      bookingType: { $ne: "Cancelled" },
      bookingDate: {
        $gte: today,
        $lte: todayEndDate,
      },
    })
    .select("bookingSlots")
    .lean();

  let slots = venue?.venueId?.timeslots || [];

  const istTime = getCurrentISTTime();
  const currentHour = istTime.getHours();

  slots = slots.filter((slot: any) => {
    const slotHour = parseInt(slot.split(":")[0]);
    return slotHour > currentHour; // Filter out slots before the current hour
  });

  bookings.forEach((booking: any) => {
    const bookedSlot = booking.bookingSlots;
    slots = slots.filter((slot: any) => slot !== bookedSlot);
  });

  const dayType = (today: string) => {
    const day = new Date(today).getDay();
    return day === 0 || day === 6 ? "weekend" : "weekday";
  };

  console.log(indiaToday);

  const dynamicPrices = await dynamicPrizeModel
    .findOne({
      date: indiaToday,
      courtId,
    })
    .select("slotPricing")
    .lean();

  const result = [] as any;

  slots.forEach((slot: any) => {
    const slotPrice =
      dynamicPrices?.slotPricing?.find((price: any) => price.slot === slot)
        ?.price ||
      venue.hourlyRate ||
      1200;
    result.push({
      slot,
      price: slotPrice,
    });
  });

  return {
    success: true,
    message: "Success",
    data: result,
  };
};

export const getCitiesService = async (payload: any, res: Response) => {
  try {
    const cities = await venueModel.distinct("city");
    return {
      success: true,
      message: "Cities retrieved successfully",
      data: cities,
    };
  } catch (error) {
    return errorResponseHandler(
      "Error retrieving cities: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const cancelMatchServices = async (payload: any, res: Response) => {
  const { percentage, reason, id } = payload.body;

  if (!percentage || !reason || !id) {
    return errorResponseHandler(
      "Invalid Payload, percentage, reason and id is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (percentage < 0 || percentage > 100) {
    return errorResponseHandler(
      "Percentage should be between 0 to 100",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const checkExist = await bookingModel.findById(id).lean();

  if (!checkExist || checkExist?.bookingType == "Cancelled") {
    return errorResponseHandler(
      "Booking does not exist or already cancelled",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const transactionIds: any = [];

  [...checkExist?.team1, ...checkExist?.team2].forEach((element) => {
    let id = element?.transactionId?.toString();
    if (!transactionIds?.includes(id)) {
      transactionIds.push(id);
    }
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  await Promise.all(
    transactionIds?.map(async (ids: any) => {
      try {
        const userTransaction = await transactionModel.findById(ids).lean();

        if (userTransaction) {
          if (userTransaction?.amount > 0) {
            let refactorCoin = Math.floor(
              (userTransaction?.amount * percentage) / 100
            );
            await bookingModel.findByIdAndUpdate(id, {
              $set: { refundPlayCoin: refactorCoin },
            });
            await additionalUserInfoModel.findOneAndUpdate(
              { userId: userTransaction.userId },
              { $inc: { playCoins: refactorCoin } },
              { session }
            );
          }

          // Refund via Razorpay if applicable
          // let refund = null;
          // const actualRefundAmount =
          //   userTransaction.amount - userTransaction.playcoinsUsed;
          // if (userTransaction.razorpayPaymentId && actualRefundAmount > 0) {
          //   refund = await razorpayInstance.payments.refund(
          //     userTransaction.razorpayPaymentId,
          //     {
          //       amount: Math.floor(
          //         ((actualRefundAmount * percentage) / 100) * 100
          //       ),
          //       notes: {
          //         bookingId: checkExist._id.toString(),
          //         userId: userTransaction.userId.toString(),
          //         reason: "Booking creator cancelled booking",
          //         CancelByAdmin: "true",
          //       },
          //     }
          //   );
          // }

          await transactionModel.create(
            [
              {
                userId: userTransaction?.userId,
                bookingId: checkExist._id,
                text: `Booking cancelled by the Admin`,
                amount: Math.floor((userTransaction.amount * percentage) / 100),
                playcoinsUsed: Math.floor(
                  (userTransaction.playcoinsUsed * percentage) / 100
                ),
                method: userTransaction?.method,
                status: "refunded",
                isWebhookVerified: true,
                razorpayRefundId: null,
                transactionDate: new Date(),
              },
            ],
            { session }
          );

          await notifyUser({
            recipientId: userTransaction.userId,
            type: "BOOKING_CANCELLED",
            title: "Booking Cancelled",
            message: `The booking scheduled for ${checkExist?.bookingDate.toLocaleDateString()} at ${
              checkExist?.bookingSlots
            } has been cancelled by the Admin with ${percentage}% refund due to ${reason}.`,
            category: "BOOKING",
            priority: "HIGH",
            referenceId: checkExist?._id
              ? new mongoose.Types.ObjectId(checkExist._id.toString())
              : id,
            referenceType: "bookings",
            notificationType: "BOTH", // Send both in-app and push notification
            session,
          });
        }
      } catch (err) {
        console.error(`Error updating transaction ${id}:`, err);
      }
    })
  );

  await bookingModel.findByIdAndUpdate(
    checkExist._id,
    {
      cancellationReason: "Admin cancelled booking",
      bookingType: "Cancelled",
    },
    { session }
  );

  await session.commitTransaction();

  return {
    success: true,
    message: "Booking cancelled successfully",
  };
};

export const dashboardServices = async (payload: any, res: Response) => {
  try {
    const { year } = payload.query;
    const now = new Date();
    const currentYear = Number(year) || now.getUTCFullYear();

    // Time boundaries in UTC
    const startOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0
      )
    );
    const endOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const endOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    );
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
    const endOfYear = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

    // Get today's scheduled bookings
    const todayScheduledBookings = await bookingModel
      .find({
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        bookingPaymentStatus: true,
        cancellationReason: null,
      })
      .populate("userId", "fullName")
      .populate("courtId", "games")
      .select("bookingSlots isMaintenance")
      .lean();

    todayScheduledBookings.sort((a, b) => {
      const slotA = Array.isArray(a.bookingSlots)
        ? a.bookingSlots[0]
        : a.bookingSlots;
      const slotB = Array.isArray(b.bookingSlots)
        ? b.bookingSlots[0]
        : b.bookingSlots;
      const [hA, mA] = slotA.split(":").map(Number);
      const [hB, mB] = slotB.split(":").map(Number);
      return hA * 60 + mA - (hB * 60 + mB);
    });

    const formatBookingData = todayScheduledBookings.map((booking) => ({
      time: booking.bookingSlots,
      matches: 1,
      game: (booking.courtId as any)?.games || "Unknown",
      player: (booking.userId as any)?.fullName || "Unknown",
      duration: "60 Mins",
      isMaintenance: booking.isMaintenance || false,
    }));

    const yearlyGameStats = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
          bookingDate: { $gte: startOfYear, $lte: endOfYear },
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      { $unwind: { path: "$courtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$courtInfo.games",
          count: { $sum: 1 },
        },
      },
    ]);

    let totalYearlyGames = 0,
      padelYearlyGames = 0,
      pickleballYearlyGames = 0;
    yearlyGameStats.forEach((stat) => {
      if (stat._id === "Padel") padelYearlyGames = stat.count;
      else if (stat._id === "Pickleball") pickleballYearlyGames = stat.count;
      totalYearlyGames += stat.count;
    });

    const gameComposition = {
      Padel: totalYearlyGames
        ? Math.round((padelYearlyGames / totalYearlyGames) * 100)
        : 0,
      Pickleball: totalYearlyGames
        ? Math.round((pickleballYearlyGames / totalYearlyGames) * 100)
        : 0,
    };

    const monthlyStats = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
          bookingDate: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      { $unwind: { path: "$courtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$courtInfo.games",
          count: { $sum: 1 },
        },
      },
    ]);

    let totalMatchesThisMonth = 0,
      padelMatchesThisMonth = 0,
      pickleballMatchesThisMonth = 0;
    monthlyStats.forEach((stat) => {
      if (stat._id === "Padel") padelMatchesThisMonth = stat.count;
      else if (stat._id === "Pickleball")
        pickleballMatchesThisMonth = stat.count;
      totalMatchesThisMonth += stat.count;
    });

    const incomeResult = await transactionModel.aggregate([
      {
        $match: {
          status: "captured",
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: "$amount" },
        },
      },
    ]);

    const incomeThisMonth = incomeResult?.[0]?.totalIncome || 0;

    const recentBookings = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      {
        $lookup: {
          from: "venues",
          localField: "venueId",
          foreignField: "_id",
          as: "venueInfo",
        },
      },
      { $unwind: "$userInfo" },
      { $unwind: "$courtInfo" },
      { $unwind: "$venueInfo" },
      {
        $project: {
          _id: 1,
          fullName: "$userInfo.fullName",
          isMaintenance: "$isMaintenance",
          game: "$courtInfo.games",
          city: "$venueInfo.city",
          date: "$bookingDate",
        },
      },
    ]);

    const monthlyGameGraph = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
          $expr: {
            $eq: [{ $year: "$bookingDate" }, currentYear],
          },
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      { $unwind: { path: "$courtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            month: { $month: "$bookingDate" },
            game: "$courtInfo.games",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          game: "$_id.game",
          count: 1,
        },
      },
    ]);

    const processedMonthlyData = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const padel =
        monthlyGameGraph.find((d) => d.month === month && d.game === "Padel")
          ?.count || 0;
      const pickleball =
        monthlyGameGraph.find(
          (d) => d.month === month && d.game === "Pickleball"
        )?.count || 0;

      return {
        month: `${month < 10 ? "0" : ""}${month}/${currentYear}`,
        padel,
        pickleball,
      };
    });

    const ongoingMatches: any = { Padel: 0, Pickleball: 0 };
    formatBookingData.forEach((entry) => {
      const game = entry.game;
      if (ongoingMatches[game] != null) ongoingMatches[game]++;
      else ongoingMatches[game] = 1;
    });

    return {
      success: true,
      message: "Dashboard data retrieved successfully",
      data: {
        todaySchedule: formatBookingData,
        monthlyGameGraph: processedMonthlyData,
        recentBookings,
        stats: {
          totalMatchesThisMonth,
          padelMatchesThisMonth,
          pickleballMatchesThisMonth,
          incomeThisMonth,
          gameComposition,
          ongoingMatches,
        },
      },
    };
  } catch (error) {
    console.error("Dashboard error:", error);
    return errorResponseHandler(
      "Error retrieving dashboard data: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

export const employeeDashboardServices = async (req: any, res: Response) => {
  try {
    const { year, venueId } = req.query;

    if (!venueId) {
      return res.status(400).json({
        success: false,
        message: "Venue ID is required",
      });
    }

    const now = new Date();
    const currentYear = Number(year) || now.getUTCFullYear();

    // Time boundaries in UTC
    const startOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0
      )
    );
    const endOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const endOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    );
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
    const endOfYear = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

    // Bookings for today (filtered by venue)
    const todayScheduledBookings = await bookingModel
      .find({
        venueId,
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        bookingPaymentStatus: true,
        cancellationReason: null,
      })
      .populate("userId", "fullName")
      .populate("courtId", "games")
      .select("bookingSlots isMaintenance")
      .lean();

    todayScheduledBookings.sort((a, b) => {
      const slotA = Array.isArray(a.bookingSlots)
        ? a.bookingSlots[0]
        : a.bookingSlots;
      const slotB = Array.isArray(b.bookingSlots)
        ? b.bookingSlots[0]
        : b.bookingSlots;
      const [hA, mA] = slotA.split(":").map(Number);
      const [hB, mB] = slotB.split(":").map(Number);
      return hA * 60 + mA - (hB * 60 + mB);
    });

    const formatBookingData = todayScheduledBookings.map((booking) => ({
      time: booking.bookingSlots,
      matches: 1,
      game: (booking.courtId as any)?.games || "Unknown",
      player: (booking.userId as any)?.fullName || "Unknown",
      duration: "60 Mins",
      isMaintenance: booking.isMaintenance || false,
    }));

    // Yearly stats
    const yearlyGameStats = await bookingModel.aggregate([
      {
        $match: {
          venueId: new mongoose.Types.ObjectId(venueId),
          bookingPaymentStatus: true,
          cancellationReason: null,
          bookingDate: { $gte: startOfYear, $lte: endOfYear },
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      { $unwind: { path: "$courtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$courtInfo.games",
          count: { $sum: 1 },
        },
      },
    ]);

    let totalYearlyGames = 0,
      padelYearlyGames = 0,
      pickleballYearlyGames = 0;
    yearlyGameStats.forEach((stat) => {
      if (stat._id === "Padel") padelYearlyGames = stat.count;
      else if (stat._id === "Pickleball") pickleballYearlyGames = stat.count;
      totalYearlyGames += stat.count;
    });

    const gameComposition = {
      Padel: totalYearlyGames
        ? Math.round((padelYearlyGames / totalYearlyGames) * 100)
        : 0,
      Pickleball: totalYearlyGames
        ? Math.round((pickleballYearlyGames / totalYearlyGames) * 100)
        : 0,
    };

    // Monthly stats
    const monthlyStats = await bookingModel.aggregate([
      {
        $match: {
          venueId: new mongoose.Types.ObjectId(venueId),
          bookingPaymentStatus: true,
          cancellationReason: null,
          bookingDate: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      { $unwind: { path: "$courtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$courtInfo.games",
          count: { $sum: 1 },
        },
      },
    ]);

    let totalMatchesThisMonth = 0,
      padelMatchesThisMonth = 0,
      pickleballMatchesThisMonth = 0;
    monthlyStats.forEach((stat) => {
      if (stat._id === "Padel") padelMatchesThisMonth = stat.count;
      else if (stat._id === "Pickleball")
        pickleballMatchesThisMonth = stat.count;
      totalMatchesThisMonth += stat.count;
    });

    // Income this month
    const incomeResult = await transactionModel.aggregate([
      {
        $match: {
          venueId: new mongoose.Types.ObjectId(venueId),
          status: "captured",
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: "$amount" },
        },
      },
    ]);
    const incomeThisMonth = incomeResult?.[0]?.totalIncome || 0;

    // Recent bookings
    const recentBookings = await bookingModel.aggregate([
      {
        $match: {
          venueId: new mongoose.Types.ObjectId(venueId),
          bookingPaymentStatus: true,
          cancellationReason: null,
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      {
        $lookup: {
          from: "venues",
          localField: "venueId",
          foreignField: "_id",
          as: "venueInfo",
        },
      },
      { $unwind: "$userInfo" },
      { $unwind: "$courtInfo" },
      { $unwind: "$venueInfo" },
      {
        $project: {
          _id: 1,
          fullName: "$userInfo.fullName",
          isMaintenance: "$isMaintenance",
          game: "$courtInfo.games",
          city: "$venueInfo.city",
          date: "$bookingDate",
        },
      },
    ]);

    // Monthly Game Graph
    const monthlyGameGraph = await bookingModel.aggregate([
      {
        $match: {
          venueId: new mongoose.Types.ObjectId(venueId),
          bookingPaymentStatus: true,
          cancellationReason: null,
          $expr: { $eq: [{ $year: "$bookingDate" }, currentYear] },
        },
      },
      {
        $lookup: {
          from: "courts",
          localField: "courtId",
          foreignField: "_id",
          as: "courtInfo",
        },
      },
      { $unwind: { path: "$courtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            month: { $month: "$bookingDate" },
            game: "$courtInfo.games",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          game: "$_id.game",
          count: 1,
        },
      },
    ]);

    const processedMonthlyData = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const padel =
        monthlyGameGraph.find((d) => d.month === month && d.game === "Padel")
          ?.count || 0;
      const pickleball =
        monthlyGameGraph.find(
          (d) => d.month === month && d.game === "Pickleball"
        )?.count || 0;

      return {
        month: `${month < 10 ? "0" : ""}${month}/${currentYear}`,
        padel,
        pickleball,
      };
    });

    const ongoingMatches: any = { Padel: 0, Pickleball: 0 };
    formatBookingData.forEach((entry) => {
      const game = entry.game;
      if (ongoingMatches[game] != null) ongoingMatches[game]++;
      else ongoingMatches[game] = 1;
    });

    return {
      success: true,
      message: "Dashboard data retrieved successfully",
      data: {
        todaySchedule: formatBookingData,
        monthlyGameGraph: processedMonthlyData,
        recentBookings,
        stats: {
          totalMatchesThisMonth,
          padelMatchesThisMonth,
          pickleballMatchesThisMonth,
          incomeThisMonth,
          gameComposition,
          ongoingMatches,
        },
      },
    };
  } catch (error) {
    console.error("Employee dashboard error:", error);
    return errorResponseHandler(
      "Error retrieving employee dashboard data: " + (error as Error).message,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// export const venueBookingFileServices = async (req: any, res: Response) => {
//   const { id } = req.params; // venue id
//   const { month = 7, year = 2025 } = req.query; // defaults
//   const venueObjectId = new Types.ObjectId(id);

//   const startOfMonth = new Date(
//     Date.UTC(Number(year), Number(month) - 1, 1, 0, 0, 0)
//   );
//   const startOfNextMonth =
//     Number(month) === 12
//       ? new Date(Date.UTC(Number(year) + 1, 0, 1, 0, 0, 0))
//       : new Date(Date.UTC(Number(year), Number(month), 1, 0, 0, 0));

//   const monthNames = [
//     "January",
//     "February",
//     "March",
//     "April",
//     "May",
//     "June",
//     "July",
//     "August",
//     "September",
//     "October",
//     "November",
//     "December",
//   ];

//   const pipeline = [
//     {
//       $match: {
//         createdAt: { $gte: startOfMonth, $lt: startOfNextMonth },
//         isWebhookVerified: true,
//         text: "Court Booking",
//       },
//     },
//     {
//       $addFields: {
//         firstBookingId: { $arrayElemAt: ["$bookingId", 0] },
//       },
//     },
//     {
//       $lookup: {
//         from: bookingModel.collection.name,
//         localField: "firstBookingId",
//         foreignField: "_id",
//         as: "booking",
//       },
//     },
//     { $unwind: "$booking" },
//     {
//       $match: {
//         "booking.venueId": venueObjectId,
//       },
//     },
//     {
//       $lookup: {
//         from: usersModel.collection.name,
//         localField: "userId",
//         foreignField: "_id",
//         as: "user",
//       },
//     },
//     { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
//     {
//       $lookup: {
//         from: venueModel.collection.name,
//         localField: "booking.venueId",
//         foreignField: "_id",
//         as: "venue",
//       },
//     },
//     { $unwind: { path: "$venue", preserveNullAndEmptyArrays: true } },
//     {
//       $lookup: {
//         from: courtModel.collection.name,
//         localField: "booking.courtId",
//         foreignField: "_id",
//         as: "court",
//       },
//     },
//     { $unwind: { path: "$court", preserveNullAndEmptyArrays: true } },
//     {
//       $project: {
//         invoiceNumber: "$booking.invoiceNumber",
//         fullName: "$user.fullName",
//         amount: 1,
//         currency: 1,
//         method: 1,
//         createdAt: 1,
//         razorpayOrderId: 1,
//         razorpayPaymentId: 1,
//         playcoinsUsed: 1,
//         venueName: "$venue.name",
//         courtName: "$court.name",
//         razorPayAmount: {
//           $subtract: ["$amount", { $ifNull: ["$playcoinsUsed", 0] }],
//         },
//       },
//     },
//   ];

//   const transactions = await transactionModel.aggregate(pipeline).exec();

//   const venueName =
//     transactions?.[0]?.venueName ||
//     (await venueModel
//       .findById(venueObjectId)
//       .lean()
//       .then((v) => v?.name)) ||
//     id;

//   const monthName = monthNames[Number(month) - 1];
//   const safeVenueName = venueName.replace(/[\/\\?%*:|"<>]/g, "_"); // sanitize
//   const fileName = `${monthName}-${safeVenueName}-Transactions.csv`;

//   const headers = [
//     "InvoiceNumber",
//     "VenueName",
//     "CourtName",
//     "UserFullName",
//     "CreatedAt",
//     "RazorpayOrderId",
//     "RazorpayPaymentId",
//     "Method",
//     "Currency",
//     "Amount",
//     "PlaycoinsUsed",
//     "RazorPayAmount",
//   ];

//   const escape = (value: any) => {
//     if (value === null || value === undefined) return "";
//     let str = String(value);
//     if (str.includes('"')) str = str.replaceAll('"', '""');
//     if (str.includes(",") || str.includes("\n") || str.includes('"')) {
//       str = `"${str}"`;
//     }
//     return str;
//   };

//   // Stream CSV
//   res.setHeader("Content-Type", "text/csv");
//   res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

//   // Write header row
//   res.write(headers.join(",") + "\n");

//   // Write each transaction
//   for (const tx of transactions) {
//     const row = [
//       tx.invoiceNumber || "",
//       tx.venueName || "",
//       tx.courtName || "",
//       tx.fullName || "",
//       tx.createdAt ? new Date(tx.createdAt).toISOString() : "",
//       tx.razorpayOrderId || "",
//       tx.razorpayPaymentId || "",
//       tx.method,
//       tx.currency,
//       tx.amount,
//       tx.playcoinsUsed ?? 0,
//       tx.razorPayAmount ?? "",
//     ].map(escape);

//     res.write(row.join(",") + "\n");
//   }

//   res.end();
// };

export const venueBookingFileServices = async (req: any, res: Response) => {
  const { id } = req.params; // venue id
  const { month = 7, year = 2025 } = req.query; // defaults
  const venueObjectId = new Types.ObjectId(id);

  const startOfMonth = new Date(
    Date.UTC(Number(year), Number(month) - 1, 1, 0, 0, 0)
  );
  const startOfNextMonth =
    Number(month) === 12
      ? new Date(Date.UTC(Number(year) + 1, 0, 1, 0, 0, 0))
      : new Date(Date.UTC(Number(year), Number(month), 1, 0, 0, 0));

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // const pipeline = [
  //   {
  //     $match: {
  //       createdAt: { $gte: startOfMonth, $lt: startOfNextMonth },
  //       isWebhookVerified: true,
  //       text: "Court Booking",
  //     },
  //   },
  //   {
  //     $addFields: {
  //       firstBookingId: { $arrayElemAt: ["$bookingId", 0] },
  //     },
  //   },
  //   {
  //     $lookup: {
  //       from: bookingModel.collection.name,
  //       localField: "firstBookingId",
  //       foreignField: "_id",
  //       as: "booking",
  //     },
  //   },
  //   { $unwind: "$booking" },
  //   {
  //     $match: {
  //       "booking.venueId": venueObjectId,
  //     },
  //   },
  //   {
  //     $lookup: {
  //       from: usersModel.collection.name,
  //       localField: "userId",
  //       foreignField: "_id",
  //       as: "user",
  //     },
  //   },
  //   { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
  //   {
  //     $lookup: {
  //       from: venueModel.collection.name,
  //       localField: "booking.venueId",
  //       foreignField: "_id",
  //       as: "venue",
  //     },
  //   },
  //   { $unwind: { path: "$venue", preserveNullAndEmptyArrays: true } },
  //   {
  //     $lookup: {
  //       from: courtModel.collection.name,
  //       localField: "booking.courtId",
  //       foreignField: "_id",
  //       as: "court",
  //     },
  //   },
  //   { $unwind: { path: "$court", preserveNullAndEmptyArrays: true } },
  //   {
  //     $project: {
  //       invoiceNumber: "$booking.invoiceNumber",
  //       fullName: "$user.fullName",
  //       amount: 1,
  //       currency: 1,
  //       method: 1,
  //       createdAt: 1,
  //       razorpayOrderId: 1,
  //       razorpayPaymentId: 1,
  //       playcoinsUsed: 1,
  //       venueName: "$venue.name",
  //       venueState: "$venue.state",
  //       courtName: "$court.name",
  //       razorPayAmount: {
  //         $subtract: ["$amount", { $ifNull: ["$playcoinsUsed", 0] }],
  //       },
  //     },
  //   },
  // ];

  const bookingData = (await bookingModel
    .find({
      venueId: id,
      bookingDate: { $gte: startOfMonth, $lt: startOfNextMonth },
      $or: [
        { bookingType: "Complete" },
        { bookingType: "Cancelled", refundPlayCoin: { $gt: 0 } },
      ],
    })
    .populate("venueId")
    .populate("courtId")
    .populate("userId")
    .lean()) as any;
  // const transactions = await transactionModel.aggregate(pipeline).exec();

  const venueName = bookingData.length ? bookingData[0]?.venueId?.name : "";
  const monthName = monthNames[Number(month) - 1];
  const safeVenueName = venueName.replace(/[\/\\?%*:|"<>]/g, "_");
  const fileName = `${monthName}-${safeVenueName}-Transactions.csv`;

  const headers = [
    "Invoice Number",
    "Invoice Link",
    "Venue Name",
    "Court Name",
    "User Name",
    "Booking Date",
    "Total Amount",
    "Rackets Rented",
    "Balls Rented",
    "Refund",
    "Booking Amount",
    "CGST",
    "SGST/UTGST",
  ];

  const escape = (value: any) => {
    if (value === null || value === undefined) return "";
    let str = String(value);
    if (str.includes('"')) str = str.replaceAll('"', '""');
    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
      str = `"${str}"`;
    }
    return str;
  };

  // Stream CSV
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.write(headers.join(",") + "\n");

  for (const tx of bookingData) {
    // GST calculations
    const bookingAmountWithoutGST =
      (Number(tx.bookingAmount) - Number(tx.refundPlayCoin)) /
      Number(process.env.GST);

    const gst =
      Number(tx.bookingAmount) -
      Number(tx.refundPlayCoin) -
      bookingAmountWithoutGST;
    const cgst = gst / 2;
    const sgstOrUtgst = gst / 2;
    const gstLabel =
      tx.venueState?.toLowerCase() === "chandigarh" ? "UTGST" : "SGST";

    const racketsRented =
      tx.team1.reduce((a: any, b: any) => a + (b.rackets || 0), 0) +
      tx.team2.reduce((a: any, b: any) => a + (b.rackets || 0), 0);

    const ballsRented =
      tx.team1.reduce((a: any, b: any) => a + (b.balls || 0), 0) +
      tx.team2.reduce((a: any, b: any) => a + (b.balls || 0), 0);

    const row = [
      tx.invoiceNumber || "",
      tx.invoiceLink || "",
      tx.venueId.name || "",
      tx.courtId.name || "",
      tx.userId.fullName || "",
      tx.bookingDate || "",
      Number(tx.bookingAmount),
      racketsRented,
      ballsRented,
      tx.refundPlayCoin || 0,
      bookingAmountWithoutGST.toFixed(2),
      cgst.toFixed(2),
      `${sgstOrUtgst.toFixed(2)}`,
    ].map(escape);

    res.write(row.join(",") + "\n");
  }

  res.end();
};
