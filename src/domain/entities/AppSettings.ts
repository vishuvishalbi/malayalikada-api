export interface IAppSettings {
  id: number;
  support_email: string | null;
  support_phone: string | null;
  support_hours: string | null;
  contact_address: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  whatsapp_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/// The mutable subset of IAppSettings. `undefined` = leave untouched,
/// `null` = clear the column.
export type AppSettingsPatch = Partial<
  Omit<IAppSettings, 'id' | 'created_at' | 'updated_at'>
>;
