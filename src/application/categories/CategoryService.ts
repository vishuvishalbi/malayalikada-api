import path from 'path';
import { ICategoryRepository } from '../../domain/repositories/ICategoryRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { NotFoundError } from '../../shared/errors/AppError';
import { ICategory, ICategoryTree } from '../../domain/entities/Category';

export class CategoryService {
  private storage = new LocalFileStorage();

  constructor(private repo: ICategoryRepository) {}

  async list(): Promise<ICategoryTree[]> {
    const all = await this.repo.findAll();
    const withUrls = all.map(c => ({
      ...c,
      image_url: c.image_filename ? this.storage.getUrl(c.image_filename) : null,
      children: [] as ICategoryTree[],
    }));
    const map = new Map(withUrls.map(c => [c.id, c]));
    const roots: ICategoryTree[] = [];
    for (const cat of withUrls) {
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(cat as ICategoryTree);
      } else {
        roots.push(cat as ICategoryTree);
      }
    }
    return roots;
  }

  async create(data: { name: string; icon?: string; parent_id?: number; sort_order?: number }) {
    return this.repo.create({
      name: data.name,
      icon: data.icon ?? null,
      image_filename: null,
      parent_id: data.parent_id ?? null,
      sort_order: data.sort_order ?? 0,
    });
  }

  async update(id: number, data: Partial<{ name: string; icon: string; parent_id: number; sort_order: number }>) {
    const cat = await this.repo.update(id, data);
    if (!cat) throw new NotFoundError('Category not found');
    return cat;
  }

  async softDelete(id: number) {
    const cat = await this.repo.findById(id);
    if (!cat) throw new NotFoundError('Category not found');
    await this.repo.softDelete(id);
  }

  async uploadImage(id: number, buffer: Buffer, originalName: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Category not found');
    if (existing.image_filename) await this.storage.delete(existing.image_filename);
    const ext = path.extname(originalName) || '.jpg';
    const filename = `category-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await this.storage.save(filename, buffer);
    await this.repo.update(id, { image_filename: filename });
    return { image_url: this.storage.getUrl(filename) };
  }

  async removeImage(id: number) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Category not found');
    if (existing.image_filename) {
      await this.storage.delete(existing.image_filename);
      await this.repo.update(id, { image_filename: null });
    }
  }
}
