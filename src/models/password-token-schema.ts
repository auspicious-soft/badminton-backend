import mongoose from "mongoose"

const passwordResetSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        sparse: true
    },
    token: {
        type: String,
        unique: true,
        required: true
    },
    expires: {
        type: Date,
        required: true
    },
    phoneNumber : {
        type: String,
    },
    isVerified: {
        type: Boolean,
        default: false
    }

});

export const passwordResetTokenModel = mongoose.model("passwordResetToken", passwordResetSchema);