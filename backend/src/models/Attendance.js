import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    checkIn: { type: Date, default: Date.now, required: true },
    checkOut: { type: Date },
  },
  { timestamps: true },
);

export const Attendance = mongoose.model("Attendance", attendanceSchema);
