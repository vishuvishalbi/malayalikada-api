import { IAppSettingsRepository } from '../../domain/repositories/IAppSettingsRepository';
import { AppSettingsPatch, IAppSettings } from '../../domain/entities/AppSettings';
import { config } from '../../shared/config';

/** DB-backed settings plus env-backed runtime config the app reads at boot. */
export type AppSettingsResponse = IAppSettings & { stripe_publishable_key: string | null };

export class AppSettingsService {
  constructor(private repo: IAppSettingsRepository) {}

  /// Always returns the singleton object (nulls when unconfigured) — the
  /// customer app calls this on every drawer open and must not error.
  async get(): Promise<AppSettingsResponse> {
    return this.withRuntimeConfig(await this.repo.get());
  }

  async update(patch: AppSettingsPatch): Promise<AppSettingsResponse> {
    return this.withRuntimeConfig(await this.repo.update(patch));
  }

  private withRuntimeConfig(row: IAppSettings): AppSettingsResponse {
    return { ...row, stripe_publishable_key: config.stripePublishableKey || null };
  }
}
