export type TokenUserType = 'customer' | 'staff';

/** Customers and staff live in separate tables, so a token's owner is (type, id). */
export const tokenUserTypeFor = (role: string): TokenUserType =>
  role === 'customer' ? 'customer' : 'staff';

export interface IAuthToken {
  user_type: TokenUserType;
  user_id: number;
}
