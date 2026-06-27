import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { ICsvImportLog } from '../../domain/entities/CsvImportLog';
import { ICsvImportLogRepository } from '../../domain/repositories/ICsvImportLogRepository';

export class CsvImportLogRepository implements ICsvImportLogRepository {
  async create(data: Omit<ICsvImportLog, 'id' | 'created_at' | 'updated_at'>): Promise<ICsvImportLog> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO csv_import_logs (filename, imported_by, rows_total, rows_ok, rows_failed, error_report_filename) VALUES (?, ?, ?, ?, ?, ?)',
      [data.filename, data.imported_by, data.rows_total, data.rows_ok, data.rows_failed, data.error_report_filename ?? null]
    );
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM csv_import_logs WHERE id = ?', [result.insertId]);
    return rows[0] as ICsvImportLog;
  }

  async findAll(): Promise<ICsvImportLog[]> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM csv_import_logs ORDER BY created_at DESC');
    return rows as ICsvImportLog[];
  }

  async findById(id: number): Promise<ICsvImportLog | null> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM csv_import_logs WHERE id = ?', [id]);
    return (rows[0] as ICsvImportLog) || null;
  }
}
