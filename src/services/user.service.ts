import type { Model } from "mongoose";

import type {
  CreateUserInput,
  StoredUser,
  UpdateUserInput
} from "../interfaces/user/index.js";
import { UserModel } from "../models/user.js";
import { BaseService } from "./base.service.js";

export class UserService extends BaseService<
  StoredUser,
  CreateUserInput,
  UpdateUserInput
> {
  constructor(model: Model<StoredUser> = UserModel) {
    super(model);
  }
}
