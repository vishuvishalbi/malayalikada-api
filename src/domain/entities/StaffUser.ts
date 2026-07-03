export interface IStaffUser {
  id: number;
  identifier: string;
  identifier_type: 'email' | 'mobile';
  password_hash: string;
  name: string;
  role: 'worker' | 'admin';
  is_active: boolean;
  store_ids?: number[];
  created_at: Date;
  updated_at: Date;
}
