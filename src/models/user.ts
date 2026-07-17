export const USER_ROLES = {
  Admin: "admin",
  Customer: "customer"
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export interface BaseUser {
  role: UserRole;
  email: string;
  name: string;
}

export interface AdminUser extends BaseUser {
  role: typeof USER_ROLES.Admin;
  username: string;
}

export interface CustomerUser extends BaseUser {
  role: typeof USER_ROLES.Customer;
  surname: string;
  deliveryAddress: string;
  telephoneNumber: string;
  fiscalCode?: string;
  dateOfBirth?: Date;
}

export type User = AdminUser | CustomerUser;
