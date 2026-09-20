import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { IAppSettings, AppSettingsPatch } from '../../domain/entities/AppSettings';
import { IAppSettingsRepository } from '../../domain/repositories/IAppSettingsRepository';

/// The settings table is a singleton keyed on this fixed id.
const SINGLETON_ID = 1;

export class AppSettingsMysqlRepository implements IAppSettingsRepository {
  async get(): Promise<IAppSettings> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM app_settings WHERE id = ?',
      [SINGLETON_ID]
    );
    const row = rows[0] as IAppSettings | undefined;
    if (row) return row;
    // Defensive: the migration seeds the row, but never let a public read fail.
    await db.query('INSERT IGNORE INTO app_settings (id) VALUES (?)', [SINGLETON_ID]);
    const [seeded] = await db.query<RowDataPacket[]>(
      'SELECT * FROM app_settings WHERE id = ?',
      [SINGLETON_ID]
    );
    return seeded[0] as IAppSettings;
  }

  async update(patch: AppSettingsPatch): Promise<IAppSettings> {
    const ALLOWED = [
      'support_email',
      'support_phone',
      'support_hours',
      'contact_address',
      'facebook_url',
      'instagram_url',
      'whatsapp_url',
    ];
    // `undefined` values are dropped so an absent key never nulls a column.
    const entries = Object.entries(patch).filter(
      ([k, v]) => ALLOWED.includes(k) && v !== undefined
    );
    if (entries.length === 0) return this.get();
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), SINGLETON_ID];
    await db.query(
      `UPDATE app_settings SET ${fields}, updated_at = NOW() WHERE id = ?`,
      values
    );
    return this.get();
  }
}
