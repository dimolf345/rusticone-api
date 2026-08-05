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
}
