import { IBrandRepository } from '../../domain/repositories/IBrandRepository';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';

export class BrandService {
  constructor(private repo: IBrandRepository) {}

  list() {
    return this.repo.findAll();
  }

  async create(data: { name: string }) {
    const existing = await this.repo.findByName(data.name);
    if (existing) throw new ConflictError('Brand already exists');
    return this.repo.create(data);
  }

  async update(id: number, data: Partial<{ name: string }>) {
    if (data.name) {
      const existing = await this.repo.findByName(data.name);
      if (existing && existing.id !== id) throw new ConflictError('Brand already exists');
    }
    const brand = await this.repo.update(id, data);
    if (!brand) throw new NotFoundError('Brand not found');
    return brand;
  }

  async softDelete(id: number) {
    const brand = await this.repo.findById(id);
    if (!brand) throw new NotFoundError('Brand not found');
    await this.repo.softDelete(id);
  }
}
