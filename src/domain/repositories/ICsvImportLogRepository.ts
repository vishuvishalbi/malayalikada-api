import { ICsvImportLog } from '../entities/CsvImportLog';

export interface ICsvImportLogRepository {
  create(data: Omit<ICsvImportLog, 'id' | 'created_at' | 'updated_at'>): Promise<ICsvImportLog>;
  findAll(): Promise<ICsvImportLog[]>;
  findById(id: number): Promise<ICsvImportLog | null>;
}
