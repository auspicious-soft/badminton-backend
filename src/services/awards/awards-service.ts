import { awardsModel } from "src/models/awards/awards-schema";
import { query, Response } from "express";



export const getAwardService = async (user: any, res: Response) => {
  const award = await awardsModel.find({userId: user.id});
  if (!award) {
    return {
      success: true,
      message: "No awards found",
      data: [],
      
    }
  }
  else{
  return {
    success: true,
    message: "Award retrieved successfully",
    data: award,
  };}
};

//Not in use
export const updateAwardService = async (userId:any, badge:any, level:any) => {
    const existingAward = await awardsModel.findOne({ userId, "badges.badge": badge });

    if (existingAward) {
      return { success: false, message: "Badge already awarded to this user" };
    }

    const updatedAward = await awardsModel.findOneAndUpdate(
      { userId },
      { 
        $push: { badges: { badge, level, achievedAt: new Date() } }
      },
      { new: true, upsert: true } 
    );

    return { success: true, data: updatedAward };
  
};


export const getAllAwardsService = async (user: any, payload: any) => {
  const page = parseInt(payload.page as string) || 1;
  const limit = parseInt(payload.limit as string) || 10;
  const offset = (page - 1) * limit;

  const awards = await awardsModel
    .find({
      userId: user.id,
    })
    .skip(offset)
    .limit(limit);

  const total = await awardsModel.countDocuments({
    userId: user.id,
  });

  if (awards.length > 0) {
    return {
      page,
      limit,
      success: true,
      message: "Awards retrieved successfully",
      total: total,
      data: awards,
    };
  } else {
    return {
      data: [],
      page,
      limit,
      success: false,
      message: "No awards found",
      total: 0,
    };
  }
};