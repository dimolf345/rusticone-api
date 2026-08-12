import { Request, Response } from "express";
import { NotFoundError } from "../errors/index.js";
import type { BaseServiceInterface } from "../interfaces/base.interface.js";
import type {
  CreateUserInput,
  StoredUser,
  UpdateUserInput
} from "../interfaces/user/index.js";
import { BaseController } from "./base.controller.js";
import { UserService } from "../services/user.service.js";

export class UserController extends BaseController<
  StoredUser,
  CreateUserInput,
  UpdateUserInput
> {
  constructor(
    service: BaseServiceInterface<
      StoredUser,
      CreateUserInput,
      UpdateUserInput
    > = new UserService()
  ) {
    super(service, "user");
  }

  update = async (
    request: Request<{ id: string }, unknown, UpdateUserInput>,
    response: Response
  ): Promise<void> => {
    request.log.info(`Updating ${this.resourceName} ${request.params.id}`);

    const entity = await this.service.update(request.params.id, request.body);

    if (!entity) {
      throw new NotFoundError(`${this.resourceName} not found`);
    }

    response.status(200).json(entity);
  };
}
