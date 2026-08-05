# Base CRUD Controller and Service

`BaseService` and `BaseController` provide reusable CRUD behavior for Mongoose
resources exposed through Express.

## Generic types

Both classes use the same three generic types:

- `TEntity`: the stored entity returned by the service.
- `TCreate`: the data accepted when creating an entity.
- `TUpdate`: the data accepted when updating an entity.

The contracts are defined in `src/interfaces/base.interface.ts`:

```ts
interface BaseServiceInterface<TEntity, TCreate, TUpdate> {
  createOne(data: TCreate): Promise<TEntity>;
  findAll(options?: FindAllOptions<TEntity>): Promise<PaginatedResult<TEntity>>;
  findOne(id: string): Promise<TEntity | null>;
  update(id: string, data: TUpdate): Promise<TEntity | null>;
  delete(id: string): Promise<TEntity | null>;
}
```

`BaseControllerInterface` exposes corresponding Express request handlers.

## Default behavior

`BaseService` delegates operations to a Mongoose model:

| Method      | Mongoose operation                      |
| ----------- | --------------------------------------- |
| `createOne` | `Model.create`                          |
| `findAll`   | `Model.find` and `Model.countDocuments` |
| `findOne`   | `Model.findById`                        |
| `update`    | `Model.findByIdAndUpdate`               |
| `delete`    | `Model.findByIdAndDelete`               |

Updates return the modified document and run schema validators.

`BaseController` maps service results to HTTP responses:

| Handler     | Success                       | Missing entity | Service error |
| ----------- | ----------------------------- | -------------- | ------------- |
| `createOne` | `201` with entity             | Not applicable | `500`         |
| `findAll`   | `200` with paginated entities | Not applicable | `500`         |
| `findOne`   | `200` with entity             | `404`          | `500`         |
| `update`    | `200` with entity             | `404`          | `500`         |
| `delete`    | `204`                         | `404`          | `500`         |

The controller also logs the operation and resource name.

## Filtering and pagination

The `findAll` controller accepts query parameters. `page` and `limit` are
reserved for pagination; every other safe query parameter is passed to
Mongoose as a filter:

```http
GET /products?page=2&limit=10&category=pizza&available=true
```

Pagination behavior:

- `page` defaults to `1`;
- `limit` defaults to `20`;
- `limit` cannot exceed `100`;
- invalid or non-positive values use the defaults;
- MongoDB applies `skip` and `limit` after filtering.

Repeated filter values use MongoDB's `$in` operator:

```http
GET /products?category=pizza&category=pasta
```

This produces a filter equivalent to:

```ts
{
  category: {
    $in: ["pizza", "pasta"];
  }
}
```

Query keys beginning with `$` or containing `.` are ignored to prevent clients
from injecting MongoDB operators or nested query paths. Concrete controllers
should add a filter allowlist when a resource must expose only selected fields.

The response contains the selected records and pagination metadata:

```json
{
  "data": [],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 24,
    "totalPages": 3
  }
}
```

Services can call `findAll` directly with typed options:

```ts
const result = await productService.findAll({
  filter: { category: "pizza" },
  page: 2,
  limit: 10
});
```

## Implement a service

Define resource-specific input types. Creation data should omit fields generated
by the database, while update data is usually partial:

```ts
interface StoredProduct {
  name: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

type CreateProductInput = Omit<StoredProduct, "createdAt" | "updatedAt">;
type UpdateProductInput = Partial<CreateProductInput>;
```

Extend `BaseService` and pass the Mongoose model to `super`:

```ts
import type { Model } from "mongoose";

import { ProductModel } from "../models/product.js";
import { BaseService } from "./base.service.js";

export class ProductService extends BaseService<
  StoredProduct,
  CreateProductInput,
  UpdateProductInput
> {
  constructor(model: Model<StoredProduct> = ProductModel) {
    super(model);
  }
}
```

Accepting the model as a constructor argument allows tests to inject a fake.

## Implement a controller

Extend `BaseController`, inject the concrete service, and provide the singular
resource name used in logs and error messages:

```ts
import type { BaseServiceInterface } from "../interfaces/base.interface.js";
import { ProductService } from "../services/product.service.js";
import { BaseController } from "./base.controller.js";

export class ProductController extends BaseController<
  StoredProduct,
  CreateProductInput,
  UpdateProductInput
> {
  constructor(
    service: BaseServiceInterface<
      StoredProduct,
      CreateProductInput,
      UpdateProductInput
    > = new ProductService()
  ) {
    super(service, "product");
  }
}
```

The handlers are arrow-function class fields, so they can be passed directly to
Express without manually binding `this`.

## Register routes

Instantiate the controller once and connect its handlers to an Express router:

```ts
import { Router } from "express";

import { ProductController } from "../controllers/product.controller.js";

const productController = new ProductController();
export const productRouter = Router();

productRouter.post("/", productController.createOne);
productRouter.get("/", productController.findAll);
productRouter.get("/:id", productController.findOne);
productRouter.patch("/:id", productController.update);
productRouter.delete("/:id", productController.delete);
```

Mount the router in `src/app.ts`:

```ts
app.use("/products", productRouter);
```

## User implementation

The existing concrete implementation is available at:

- `src/services/user.service.ts`
- `src/controllers/user.controller.ts`
- `src/interfaces/user/user.interface.ts`

`UserService` uses `UserModel`, and `UserController` uses `UserService` with the
resource name `user`.

## Customize behavior

Override a service method when a resource needs filtering, authorization-aware
queries, serialization, or other domain behavior:

```ts
export class ProductService extends BaseService<
  StoredProduct,
  CreateProductInput,
  UpdateProductInput
> {
  constructor(model: Model<StoredProduct> = ProductModel) {
    super(model);
  }

  override async findAll(
    options: FindAllOptions<StoredProduct> = {}
  ): Promise<PaginatedResult<StoredProduct>> {
    return super.findAll({
      ...options,
      filter: { ...options.filter, archived: false }
    });
  }
}
```

Keep resource-specific behavior in the concrete service or controller. Do not
add it to the base classes unless every CRUD resource requires it.

## Testing

Inject a fake model when unit-testing a service and a fake service when
unit-testing a controller. This avoids requiring MongoDB for unit tests:

```ts
const service = {
  createOne: async (data: CreateProductInput) => ({
    ...storedProduct,
    ...data
  }),
  findAll: async () => ({
    data: [storedProduct],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  }),
  findOne: async () => storedProduct,
  update: async () => storedProduct,
  delete: async () => storedProduct
};

const controller = new ProductController(service);
```

Use `npm run test:local` to invoke the test runner directly. Integration tests
still require a configured MongoDB connection. Use `npm test` to run the full
suite with the Docker test database.

## Responsibilities not included

The base classes do not provide:

- request validation;
- authentication or authorization;
- sorting;
- OpenAPI route definitions;
- conversion of Mongoose validation or cast errors to specific HTTP statuses.

Add these concerns in resource-specific routes, middleware, services, or
controllers as required.
