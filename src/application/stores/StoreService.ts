import path from 'path';
import { IStoreRepository } from '../../domain/repositories/IStoreRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { NotFoundError } from '../../shared/errors/AppError';
import { IStore } from '../../domain/entities/Store';

export class StoreService {
  private storage = new LocalFileStorage();

  constructor(private repo: IStoreRepository) {}

  async list() {
    const stores = await this.repo.findAll();
    return stores.map(s => this.withLogoUrl(s));
  }

  async getById(id: number) {
    const store = await this.repo.findById(id);
    if (!store) throw new NotFoundError('Store not found');
    return this.withLogoUrl(store);
  }

  async create(data: { name: string; address: string; phone: string; bank_account?: string; icon?: string }) {
    const store = await this.repo.create({
      ...data,
      bank_account: data.bank_account ?? null,
      icon: data.icon ?? null,
      logo_filename: null,
      is_active: true,
    });
    return this.withLogoUrl(store);
  }

  async update(id: number, data: Partial<{ name: string; address: string; phone: string; bank_account: string; icon: string; is_active: boolean }>) {
    const store = await this.repo.update(id, data);
    if (!store) throw new NotFoundError('Store not found');
    return this.withLogoUrl(store);
  }

  async uploadLogo(id: number, buffer: Buffer, originalName: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Store not found');
    if (existing.logo_filename) await this.storage.delete(existing.logo_filename);
    const ext = path.extname(originalName) || '.jpg';
    const filename = `store-${id}-logo-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await this.storage.save(filename, buffer);
    await this.repo.update(id, { logo_filename: filename });
    return { logo_url: this.storage.getUrl(filename) };
  }

  async removeLogo(id: number) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Store not found');
    if (existing.logo_filename) {
      await this.storage.delete(existing.logo_filename);
      await this.repo.update(id, { logo_filename: null });
    }
  }

  private withLogoUrl(store: IStore) {
    return {
      ...store,
      logo_url: store.logo_filename ? this.storage.getUrl(store.logo_filename) : null,
    };
  }
}
