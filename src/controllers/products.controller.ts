import type { Request, Response } from "express";

import { BadRequestError } from "../errors/index.js";
import { IBaseServiceInterface } from "../interfaces/base.interface.js";
import {
    IProduct,
    IProductCreateRequest,
    IStoredProduct
} from "../interfaces/products/product.interface.js";
import type { IUploadSessionStore } from "../interfaces/upload/index.js";
import { ProductService } from "../services/product.service.js";
import { RedisUploadSessionStore } from "../services/upload-session-store.service.js";
import { BaseController } from "./base.controller.js";

export class ProductsController extends BaseController<
    IStoredProduct,
    IProductCreateRequest,
    IProduct
> {
    constructor(
        service: IBaseServiceInterface<
            IStoredProduct,
            IProductCreateRequest,
            IProduct
        > = new ProductService(),
        private readonly uploadSessionStore: IUploadSessionStore = new RedisUploadSessionStore()
    ) {
        super(service, "product");
    }

    /** Resolves any pre-uploaded images before delegating to the base create flow. */
    public override createOne = async (
        request: Request<unknown, unknown, IProductCreateRequest>,
        response: Response
    ): Promise<void> => {
        request.log.info(`Creating ${this.resourceName}`);

        const { uploadSessionId, ...productData } = request.body;

        if (uploadSessionId) {
            request.log.info({ uploadSessionId }, "Resolving pre-uploaded product images");
            const imageUrls = await this.uploadSessionStore.get(uploadSessionId);

            if (!imageUrls) {
                throw new BadRequestError(
                    "Invalid or expired uploadSessionId. Please upload images again."
                );
            }

            productData.productImages = imageUrls;
            await this.uploadSessionStore.delete(uploadSessionId);
            request.log.info({ uploadSessionId }, "Consumed pre-uploaded product images");
        }

        const entity = await this.service.createOne(productData);
        response.status(201).json(entity);
    };
}