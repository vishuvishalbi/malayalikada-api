export interface IBrand {
  id: number;
  name: string;
  logo_filename: string | null;
  product_count?: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
