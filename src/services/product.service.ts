import { Model } from "mongoose";
import { IProduct, IStoredProduct } from "../interfaces/products/product.interface.js";
import { BaseService } from "./base.service.js";
import { ProductModel } from "../models/product.js";

export class ProductService extends BaseService<IStoredProduct, IProduct, IProduct> {
    constructor(model: Model<IStoredProduct> = ProductModel) {
        super(model);
    }
}