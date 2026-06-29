export interface ICustomer {
  id: number;
  identifier: string;
  identifier_type: 'email' | 'mobile';
  password_hash: string;
  first_name: string;
  last_name: string;
  preferred_store_id: number | null;
  address?: string | null;
  phone?: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
