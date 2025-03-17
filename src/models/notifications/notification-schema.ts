import { Schema, model } from 'mongoose';

const notificationsSchema = new Schema({
    userIds: {
        type: [Schema.ObjectId],
        ref: "users"
    },
    title: {
        type: Object,
        required: true
    },
    description: {
        type: Object,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        default: Date.now
    },
},
    { timestamps: true }
)

export const notificationsModel = model('notifications', notificationsSchema)