export interface IDeliverySlab {
  id: number;
  min_weight_kg: number;
  max_weight_kg: number | null;
  fee_nzd: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
