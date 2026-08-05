export interface BaseUser {
  role: string;
  email: string;
  name: string;
  authProvider: string;
  authProviderUserId: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  lastLoginAt?: Date;
}

export interface AdminUser extends BaseUser {
  role: "admin";
  username: string;
}

export interface CustomerUser extends BaseUser {
  role: "customer";
  surname: string;
  deliveryAddress: string;
  telephoneNumber: string;
  fiscalCode?: string;
  dateOfBirth?: Date;
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
