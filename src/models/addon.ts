import mongoose, { Schema } from "mongoose";
import { IProductAddon } from "../interfaces/products/addon.interface.js";

const addonSchema = new Schema<IProductAddon>({
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Addon'
    },
    name: {
        type: String,
        required: true,
        minLength: [5, 'Addon name name too short']
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Addon price can\'t be negative']
    },
    note: {
        type: String,
        required: false
    }
}, { versionKey: false });

export const AddonModel = mongoose.model('Addon', addonSchema);