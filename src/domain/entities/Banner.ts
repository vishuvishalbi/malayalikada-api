export interface IBanner {
  id: number;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  cta_route: string | null;
  image_filename: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}
