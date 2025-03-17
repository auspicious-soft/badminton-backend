import { Schema, model } from 'mongoose';

const discountVouchersSchema = new Schema({
   
    couponCode: {
        type: String,
        required: true
    },
    percentage :{
        type:Number,
        required: true
    },
    activationAllowed: {
        type: Number,
        required: true
    },
    codeActivated: {
        type: Number,
        default: 0
    },
  
},
    { timestamps: true }
)

export const discountVouchersModel = model('discountVouchers', discountVouchersSchema)