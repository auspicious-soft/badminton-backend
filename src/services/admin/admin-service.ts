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
import mongoose from "mongoose";
import { venueModel } from "src/models/venue/venue-schema";
import { bookingModel } from "src/models/venue/booking-schema";
import { usersModel } from "src/models/user/user-schema";
import { object } from "webidl-conversions";
import { courtModel } from "src/models/venue/court-schema";
import { productModel } from "src/models/admin/products-schema";
import { getCurrentISTTime } from "../../utils";
import { request } from "http";
import { transactionModel } from "src/models/admin/transaction-schema";

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

    // Execute aggregation with collation for case-insensitive sorting
    const employees = await employeesModel
      .aggregate(pipeline as any)
      .collation({
        locale: "en",
        strength: 2, // Case-insensitive sorting
      })
      .exec();

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
  console.log("payload: ", payload.currentUser);
  const results = await adminModel.findById(payload.currentUser.id).lean();
  return {
    success: true,
    data: results,
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
  console.log("Sorting Parameters:", { sortBy, order });

  // Pagination and search parameters
  const { page, limit, search } = payload.query;
  const pageNumber = parseInt(page) || 1;
  const limitNumber = parseInt(limit) || 10;
  const offset = (pageNumber - 1) * limitNumber;

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
          createdAt: 1,
          _id: 1,
        },
      },
    ];

    // Log pipeline for debugging
    console.log("Aggregation Pipeline:", JSON.stringify(pipeline, null, 2));

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
      if (venueData.courts) {
        courtData = venueData.courts.find(
          (court: any) => court._id.toString() === booking.courtId.toString()
        );
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
    game = "all",
    date,
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
    const currentDate = getCurrentISTTime();

    console.log(`Current IST time: ${currentDate.toISOString()}`);

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
      // If no date is provided, use the type filter
      if (type === "upcoming") {
        matchQuery.bookingDate = { $gt: currentDate };
      } else if (type === "completed") {
        matchQuery.bookingDate = { $lt: currentDate };
      }
    }

    // Always apply cancellation filter for cancelled type
    if (type === "cancelled") {
      matchQuery.cancellationReason = { $ne: null };
    }

    // Add search query if provided
    if (city) {
      // We need to first find venues with matching city
      const venues = await venueModel
        .find({
          city: { $regex: city, $options: "i" },
        })
        .select("_id")
        .lean();

      // Then use those venue IDs in our booking query
      const venueIds = venues.map((venue) => venue._id);
      matchQuery.venueId = { $in: venueIds };
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
    if (game !== "all") {
      filteredBookings = bookings.filter(
        (booking) => booking.courtId && (booking.courtId as any).games === game // Use the game parameter for filtering
      );
    }

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

export const dashboardServices = async (payload: any, res: Response) => {
  try {
    // Get today's scheduled bookings
    const { year } = payload.query;
    const currentYear = Number(year) || new Date().getFullYear();

    // Get current date/time in IST
    const now = getCurrentISTTime();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

    // Calculate start and end of current month in IST
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Calculate start and end of current year in IST
    const startOfYear = new Date(currentYear, 0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    
    const endOfYear = new Date(currentYear, 11, 31);
    endOfYear.setHours(23, 59, 59, 999);

    // Get today's scheduled bookings - use getCurrentISTTime for consistent timezone
    const todayStart = getCurrentISTTime();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = getCurrentISTTime();
    todayEnd.setHours(23, 59, 59, 999);

    // Log for debugging
    console.log(`Current IST time: ${now.toISOString()}`);
    console.log(`Today start: ${todayStart.toISOString()}`);
    console.log(`Today end: ${todayEnd.toISOString()}`);

    const todayScheduledBookings = await bookingModel
      .find({
        bookingDate: { 
          $gte: getCurrentISTTime() // Keep this for future bookings today
        },
        bookingPaymentStatus: true,
        cancellationReason: null,
      })
      .populate("userId", "fullName")
      .populate("courtId", "games")
      .select("bookingSlots isMaintenance")
      .lean();

    console.log(`Found ${todayScheduledBookings.length} scheduled bookings`);

    // Then sort them manually with higher times at the top
    todayScheduledBookings.sort((a, b) => {
      // Handle both array and string cases for bookingSlots
      const slotA = Array.isArray(a.bookingSlots) ? a.bookingSlots[0] : a.bookingSlots;
      const slotB = Array.isArray(b.bookingSlots) ? b.bookingSlots[0] : b.bookingSlots;
      
      // Extract hours and minutes for comparison
      const [hoursA, minutesA] = slotA.split(':').map((num: string) => parseInt(num, 10));
      const [hoursB, minutesB] = slotB.split(':').map((num: string) => parseInt(num, 10));
      
      // Convert to minutes for easier comparison
      const totalMinutesA = hoursA * 60 + minutesA;
      const totalMinutesB = hoursB * 60 + minutesB;
      
      // Sort in descending order (higher times first)
      return totalMinutesA - totalMinutesB;
    });

    let formatBookingData: any = [];
    todayScheduledBookings?.forEach((booking: any) => {
      formatBookingData.push({
        time: booking.bookingSlots,
        matches: 1,
        game: booking.courtId?.games || "Unknown",
        player: booking.userId?.fullName || "Unknown",
        duration: "60 Mins",
        isMaintenance: booking.isMaintenance || false,
      });
    });

    // Get yearly game composition statistics
    const yearlyGameStats = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
          bookingDate: {
            $gte: startOfYear,
            $lte: endOfYear,
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
      {
        $unwind: {
          path: "$courtInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$courtInfo.games",
          count: { $sum: 1 },
        },
      },
    ]);

    // Calculate game composition percentages
    let totalYearlyGames = 0;
    let padelYearlyGames = 0;
    let pickleballYearlyGames = 0;

    yearlyGameStats.forEach((stat) => {
      if (stat._id) {
        totalYearlyGames += stat.count;

        if (stat._id === "Padel") {
          padelYearlyGames = stat.count;
        } else if (stat._id === "Pickleball") {
          pickleballYearlyGames = stat.count;
        }
      }
    });

    const gameComposition = {
      Padel:
        totalYearlyGames > 0
          ? Math.round((padelYearlyGames / totalYearlyGames) * 100)
          : 0,
      Pickleball:
        totalYearlyGames > 0
          ? Math.round((pickleballYearlyGames / totalYearlyGames) * 100)
          : 0,
    };

    // Get monthly statistics for matches
    const monthlyStats = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
          bookingDate: {
            $gte: startOfMonth,
            $lte: endOfMonth,
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
      {
        $unwind: {
          path: "$courtInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$courtInfo.games",
          count: { $sum: 1 },
        },
      },
    ]);

    // Calculate total matches this month
    let totalMatchesThisMonth = 0;
    let padelMatchesThisMonth = 0;
    let pickleballMatchesThisMonth = 0;

    monthlyStats.forEach((stat) => {
      totalMatchesThisMonth += stat.count;

      if (stat._id === "Padel") {
        padelMatchesThisMonth = stat.count;
      } else if (stat._id === "Pickleball") {
        pickleballMatchesThisMonth = stat.count;
      }
    });

    // Calculate income this month from transactions
    const incomeResult = await transactionModel.aggregate([
      {
        $match: {
          status: "captured", // Only successful transactions
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: "$amount" },
        },
      },
    ]);

    const incomeThisMonth =
      incomeResult.length > 0 ? incomeResult[0].totalIncome : 0;

    // Get recent bookings
    const recentBookings = await bookingModel.aggregate([
      {
        $match: {
          bookingPaymentStatus: true,
          cancellationReason: null,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit: 5,
      },
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
      {
        $unwind: {
          path: "$userInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$courtInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$venueInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
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

    // Get monthly game data for graph
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
      {
        $unwind: {
          path: "$courtInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
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

    // Process the monthly game data
    const processedMonthlyData = [];
    for (let i = 1; i <= 12; i++) {
      const monthStr = i < 10 ? `0${i}/${currentYear}` : `${i}/${currentYear}`;

      // Find padel and pickleball counts for this month
      const padelData = monthlyGameGraph.find(
        (item) => item.month === i && item.game === "Padel"
      );
      const pickleballData = monthlyGameGraph.find(
        (item) => item.month === i && item.game === "Pickleball"
      );

      processedMonthlyData.push({
        month: monthStr,
        padel: padelData ? padelData.count : 0,
        pickleball: pickleballData ? pickleballData.count : 0,
      });
    }

    const ongoingMatches: any = { Padel: 0, Pickleball: 0 };

    formatBookingData?.map((data: any) => {
      if (ongoingMatches.hasOwnProperty(data.game)) {
        ongoingMatches[data.game] += 1;
      } else {
        ongoingMatches[data.game] = 1;
      }
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
