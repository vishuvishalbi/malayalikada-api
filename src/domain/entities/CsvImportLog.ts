export interface ICsvImportLog {
  id: number;
  filename: string;
  imported_by: number;
  rows_total: number;
  rows_ok: number;
  rows_failed: number;
  error_report_filename: string | null;
  created_at: Date;
  updated_at: Date;
}
