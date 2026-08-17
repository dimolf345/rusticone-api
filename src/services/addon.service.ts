import { Model } from "mongoose";
import { IAddon, IProductAddon } from "../interfaces/products/addon.interface.js";
import { BaseService } from "./base.service.js";
import { AddonModel } from "../models/addon.js";

export class AddonService extends BaseService<IProductAddon, IAddon, IAddon> {
    constructor(model: Model<IProductAddon> = AddonModel) {
        super(model);
    }
}