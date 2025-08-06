import axios from "axios";
import { configDotenv } from "dotenv";
import { Request, Response } from "express";
import mongoose, { SortOrder } from "mongoose";
import { usersModel } from "src/models/user/user-schema";
configDotenv();

const { AWS_REGION, AWS_BUCKET_NAME } = process.env;

export const checkValidAdminRole = (req: Request, res: Response, next: any) => {
  const { role } = req.headers;
  if (role !== "admin")
    return res.status(403).json({ success: false, message: "Invalid role" });
  else return next();
};

/**
 * Get current time in Indian Standard Time (IST)
 * This function handles both local and production environments correctly
 * @returns Date object representing current time in IST
 */
export const getCurrentISTTime = (): Date => {
  const now = new Date();

  // Get the local timezone offset in minutes
  const localOffsetMinutes = now.getTimezoneOffset();

  // IST is UTC+5:30 (or -330 minutes from UTC)
  const istOffsetMinutes = -330;

  // Calculate the difference between local timezone and IST in milliseconds
  const offsetDiffMs = (localOffsetMinutes - istOffsetMinutes) * 60 * 1000;

  // Apply the difference to get IST time
  return new Date(now.getTime() + offsetDiffMs);
};

/**
 * Check if a date is today in IST
 * @param date Date to check
 * @returns Boolean indicating if the date is today in IST
 */
export const isDateTodayInIST = (date: Date): boolean => {
  const istNow = getCurrentISTTime();

  return (
    date.getFullYear() === istNow.getFullYear() &&
    date.getMonth() === istNow.getMonth() &&
    date.getDate() === istNow.getDate()
  );
};

/**
 * Format a date to IST string representation
 * @param date Date to format
 * @returns String representation of the date in IST
 */
export const formatToISTString = (date: Date): string => {
  // Create a date string that explicitly mentions IST
  return (
    date.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
};

type SetScore = {
  team1: number;
  team2: number;
};

type GameScore = {
  [key: string]: SetScore;
};

export const getWinnerTeam = (
  gameType: string,
  score: GameScore
): "team1" | "team2" | "draw" => {
  let team1Sets = 0;
  let team2Sets = 0;

  for (const key of Object.keys(score)) {
    const set = score[key];
    if (!set || typeof set.team1 !== "number" || typeof set.team2 !== "number")
      continue;

    if (set.team1 > set.team2) {
      team1Sets += 1;
    } else if (set.team2 > set.team1) {
      team2Sets += 1;
    }
  }

  if (team1Sets > team2Sets) return "team1";
  if (team2Sets > team1Sets) return "team2";
  return "draw"; // Optional if draw isn't possible
};
