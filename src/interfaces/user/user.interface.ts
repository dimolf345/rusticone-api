export interface IBaseUser {
  _id: string;
  role: string;
  email: string;
  name?: string;
  surname?: string;
  authProvider: string;
  authProviderUserId: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  lastLoginAt?: Date;
  username?: string;
  deliveryAddress?: string;
  telephoneNumber?: string;
  fiscalCode?: string;
  dateOfBirth?: Date;
}

export interface IAdminUser extends IBaseUser {
  role: "admin";
}

export interface ICustomerUser extends IBaseUser {
  role: "customer";
  deliveryAddress: string;
  telephoneNumber: string;
  fiscalCode: string;
}

export interface IStoredUser extends IBaseUser {
  emailVerified?: boolean;
  lastLoginAt?: Date;
  password?: string;
  googleId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type UserDto = Omit<IBaseUser, '_id'> & { id: string };
export type CreateUserInput = Omit<IStoredUser, "createdAt" | "updatedAt">;
export type UpdateUserInput = Partial<CreateUserInput>;
