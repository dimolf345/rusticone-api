import mongoose from "mongoose";

export interface IAddon {
    _id?: string;
    name: string;
    price: number;
    note: string;
}

export interface IProductAddon extends IAddon {
    referenceId: mongoose.Schema.Types.ObjectId;
}