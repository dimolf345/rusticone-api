export interface BaseUser {
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

export interface AdminUser extends BaseUser {
  role: "admin";
}

export interface CustomerUser extends BaseUser {
  role: "customer";
  deliveryAddress: string;
  telephoneNumber: string;
  fiscalCode: string;
}

export interface StoredUser extends BaseUser {
  emailVerified?: boolean;
  lastLoginAt?: Date;
  password?: string;
  googleId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateUserInput = Omit<StoredUser, "createdAt" | "updatedAt">;
export type UpdateUserInput = Partial<CreateUserInput>;
