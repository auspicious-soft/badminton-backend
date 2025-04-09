import mongoose, { Schema } from "mongoose";


export interface AttendanceDocument extends Document {
    employeeId: string;
    date: Date;
    status: "Present" | "Absent" | "Leave";
    checkInTime?: Date;
    checkOutTime?: Date;
    createdAt?: Date;
    
    updatedAt?: Date;
  }
  
  const attendanceSchema = new Schema(
    {
      employeeId: { type: Schema.Types.ObjectId, ref: "employees", required: true },
      date: { type: Date, required: true },
      status: { type: String, enum: ["Present", "Absent", "Leave"], required: true },
      checkInTime: { type: Date },
      checkOutTime: { type: Date },
    },
    { timestamps: true }
  );
  
  export const attendanceModel = mongoose.model<AttendanceDocument>("attendance", attendanceSchema);
  