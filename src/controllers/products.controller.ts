import { IBaseServiceInterface } from "../interfaces/base.interface.js";
import { IProduct, IStoredProduct } from "../interfaces/products/product.interface.js";
import { ProductService } from "../services/product.service.js";
import { BaseController } from "./base.controller.js";

export class ProductsController extends BaseController<IStoredProduct, IProduct, IProduct> {
    constructor(service: IBaseServiceInterface<IStoredProduct, IProduct, IProduct> = new ProductService()) {
        super(service, 'product')
    }
}