import { IAppSettingsRepository } from '../../domain/repositories/IAppSettingsRepository';
import { AppSettingsPatch } from '../../domain/entities/AppSettings';

export class AppSettingsService {
  constructor(private repo: IAppSettingsRepository) {}

  /// Always returns the singleton object (nulls when unconfigured) — the
  /// customer app calls this on every drawer open and must not error.
  async get() {
    return this.repo.get();
  }

  async update(patch: AppSettingsPatch) {
    return this.repo.update(patch);
  }
}
