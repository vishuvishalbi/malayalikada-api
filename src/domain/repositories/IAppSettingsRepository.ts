import { IAppSettings, AppSettingsPatch } from '../entities/AppSettings';

export interface IAppSettingsRepository {
  /// Reads the singleton row. Always resolves to a row (seeded by migration).
  get(): Promise<IAppSettings>;
  /// Updates only the keys present in `patch`; absent keys are left as-is.
  update(patch: AppSettingsPatch): Promise<IAppSettings>;
}
