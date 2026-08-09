import type { Model } from "mongoose";

import type {
  CreateUserInput,
  StoredUser,
  UpdateUserInput
} from "../interfaces/user/index.js";
import { USER_ROLES, UserModel } from "../models/user.js";
import { BaseService } from "./base.service.js";
import { AccessTokenPayload } from "../interfaces/auth/jwt.interface.js";

export class UserService extends BaseService<
  StoredUser,
  CreateUserInput,
  UpdateUserInput
> {
  constructor(model: Model<StoredUser> = UserModel) {
    super(model);
  }

  /**
   * Checks whether the update should be allowed. 
   * If the updating user role is admin, the authenticated role must be admin.
   * If it's a non-admin role, then the only user allowed to be updated is itself, so check compare userId.
   * @param payload 
   * @param userInfo 
   * @returns 
   */
  isValidUpdate(payload: Partial<CreateUserInput>, userInfo: AccessTokenPayload): boolean {
    if (payload.role === USER_ROLES.Admin) {
      return userInfo.role === USER_ROLES.Admin;
    } else {
      return payload._id === userInfo.userId;
    }
  }
}
