/** What a deleted account is renamed to; the row itself is kept so orders and reports still join to it. */
export const ANONYMIZED_NAME = { first_name: 'Deleted', last_name: 'User' } as const;

/** Unique per customer and not a valid email or mobile, so it frees the original login and can't collide with a real one. */
export const anonymizedIdentifier = (customerId: number): string => `deleted:${customerId}`;

export const isAnonymizedCustomer = (customer: Pick<ICustomer, 'id' | 'identifier'>): boolean =>
  customer.identifier === anonymizedIdentifier(customer.id);

export interface ICustomer {
  id: number;
  identifier: string;
  identifier_type: 'email' | 'mobile';
  password_hash: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone_number?: string | null;
  preferred_store_id: number | null;
  address?: string | null;
  phone?: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
