export interface ICategory {
  id: number;
  name: string;
  icon: string | null;
  image_filename: string | null;
  parent_id: number | null;
  sort_order: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ICategoryTree extends ICategory {
  children: ICategoryTree[];
}
