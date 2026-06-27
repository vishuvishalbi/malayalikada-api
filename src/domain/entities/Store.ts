export interface IStore {
  id: number;
  name: string;
  address: string;
  phone: string;
  bank_account: string | null;
  icon: string | null;
  logo_filename: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
