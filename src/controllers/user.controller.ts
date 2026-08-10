import { Request, Response } from "express";
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
    console.info(`Updating ${this.resourceName} ${request.params.id}`);

    try {
      const entity = await this.service.update(request.params.id, request.body);

      if (!entity) {
        response
          .status(404)
          .json({ message: `${this.resourceName} not found` });
        return;
      }

      response.status(200).json(entity);
    } catch (error) {
      this.handleError(
        response,
        `Unable to update ${this.resourceName}`,
        error
      );
    }
  };
}
