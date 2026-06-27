import path from 'path';
import { IBannerRepository } from '../../domain/repositories/IBannerRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { NotFoundError } from '../../shared/errors/AppError';
import { IBanner } from '../../domain/entities/Banner';

export class BannerService {
  private storage = new LocalFileStorage();

  constructor(private repo: IBannerRepository) {}

  async list() {
    const banners = await this.repo.findAllActive();
    return banners.map(b => this.withImageUrl(b));
  }

  async create(data: { title: string; subtitle?: string; cta_label?: string; cta_route?: string; sort_order?: number }) {
    const banner = await this.repo.create({
      title: data.title,
      subtitle: data.subtitle ?? null,
      cta_label: data.cta_label ?? null,
      cta_route: data.cta_route ?? null,
      image_filename: null,
      is_active: true,
      sort_order: data.sort_order ?? 0,
    });
    return this.withImageUrl(banner);
  }

  async update(id: number, data: Partial<{ title: string; subtitle: string; cta_label: string; cta_route: string; sort_order: number; is_active: boolean }>) {
    const banner = await this.repo.update(id, data);
    if (!banner) throw new NotFoundError('Banner not found');
    return this.withImageUrl(banner);
  }

  async uploadImage(id: number, buffer: Buffer, originalName: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Banner not found');
    if (existing.image_filename) await this.storage.delete(existing.image_filename);
    const ext = path.extname(originalName) || '.jpg';
    const filename = `banner-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await this.storage.save(filename, buffer);
    await this.repo.update(id, { image_filename: filename });
    return { image_url: this.storage.getUrl(filename) };
  }

  async deactivate(id: number) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Banner not found');
    await this.repo.deactivate(id);
  }

  private withImageUrl(banner: IBanner) {
    return {
      ...banner,
      image_url: banner.image_filename ? this.storage.getUrl(banner.image_filename) : null,
    };
  }
}
