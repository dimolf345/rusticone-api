import { Request, Response } from "express";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError
} from "../errors/index.js";
import type { IBaseServiceInterface } from "../interfaces/base.interface.js";
import type { IAuthenticatedRequest } from "../interfaces/auth/index.js";
import type {
  CreateUserInput,
  IStoredUser,
  UpdateUserInput
} from "../interfaces/user/index.js";
import { USER_ROLES } from "../models/user.js";
import { BaseController } from "./base.controller.js";
import { UserService } from "../services/user.service.js";

export class UserController extends BaseController<
  IStoredUser,
  CreateUserInput,
  UpdateUserInput
> {
  constructor(
    service: IBaseServiceInterface<
      IStoredUser,
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
    const authUser = (request as IAuthenticatedRequest).user;
    const { body } = request;

    if (authUser?.role === USER_ROLES.Customer) {
      if (authUser.userId !== request.params.id) {
        request.log.warn(
          { userId: authUser.userId, targetId: request.params.id },
          "Customer attempted to update another user"
        );
        throw new ForbiddenError("You can only update your own profile");
      }

      if (body.role !== undefined && body.role !== authUser.role) {
        request.log.warn(
          { userId: authUser.userId, requestedRole: body.role },
          "Customer attempted to change their role"
        );
        throw new UnauthorizedError("You are not allowed to modify the user role");
      }
    }

    request.log.info(`Updating ${this.resourceName} ${request.params.id}`);

    const entity = await this.service.update(request.params.id, request.body);

    if (!entity) {
      throw new NotFoundError(`${this.resourceName} not found`);
    }

    response.status(200).json(entity);
  };
}
