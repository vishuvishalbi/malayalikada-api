import path from 'path';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors/AppError';

export class ProductService {
  private storage = new LocalFileStorage();

  constructor(private repo: IProductRepository) {}

  async list(filters: { category_id?: number; search?: string; store_id?: number; include_inactive?: boolean; page?: number; limit?: number }) {
    return this.repo.findAll({
      category_id: filters.category_id,
      search: filters.search,
      store_id: filters.store_id,
      include_inactive: filters.include_inactive,
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
    });
  }

  async getById(id: number, storeId?: number, customerId?: number) {
    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    const images = await this.repo.getImages(id);
    const mappedImages = images.map(img => ({
      ...img,
      path: img.path ?? `/uploads/${img.filename}`,
      url: img.url ?? this.storage.getUrl(img.filename),
    }));

    if (!storeId) {
      const isFavorited = customerId ? await this.repo.isFavorited(id, customerId) : false;
      return { ...product, images: mappedImages, is_favorited: isFavorited };
    }

    const [storeData, related, isFavorited, isNotifyRequested] = await Promise.all([
      this.repo.findStoreData(id, storeId),
      this.repo.findRelated(product.category_id, id, storeId),
      customerId ? this.repo.isFavorited(id, customerId) : Promise.resolve(false),
      customerId ? this.repo.isNotifyRequested(id, customerId, storeId) : Promise.resolve(false),
    ]);

    return {
      ...product,
      images: mappedImages,
      price: storeData.price,
      stock_quantity: storeData.stock_quantity,
      in_stock: storeData.in_stock,
      is_favorited: isFavorited,
      is_notify_requested: isNotifyRequested,
      related_products: related,
    };
  }

  async getByBarcode(barcode: string) {
    const product = await this.repo.findByBarcode(barcode);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  async create(data: {
    barcode: string; name: string; description?: string; category_id: number;
    brand?: string; unit?: string; weight?: number; supplier?: string; is_featured?: boolean;
  }) {
    const existing = await this.repo.findByBarcode(data.barcode);
    if (existing) throw new ConflictError('Barcode already exists');
    return this.repo.create({
      ...data,
      description: data.description ?? null,
      brand: data.brand ?? null,
      unit: data.unit ?? null,
      weight: data.weight ?? null,
      supplier: data.supplier ?? null,
      is_active: true,
      is_featured: data.is_featured ?? false,
    });
  }

  async update(id: number, data: Partial<{
    barcode: string; name: string; description: string; category_id: number;
    brand: string; unit: string; weight: number; supplier: string; is_active: boolean;
  }>) {
    if (data.barcode) {
      const existing = await this.repo.findByBarcode(data.barcode);
      if (existing && existing.id !== id) throw new ConflictError('Barcode already exists');
    }
    const product = await this.repo.update(id, data);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  async softDelete(id: number) {
    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    await this.repo.softDelete(id);
  }

  async uploadImage(productId: number, buffer: Buffer, originalName: string) {
    const product = await this.repo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    const count = await this.repo.getImageCount(productId);
    if (count >= 5) throw new ValidationError('Maximum 5 images per product');
    const ext = path.extname(originalName) || '.jpg';
    const filename = `product-${productId}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await this.storage.save(filename, buffer);
    const image = await this.repo.addImage(productId, filename, count);
    return { ...image, url: this.storage.getUrl(filename) };
  }

  async removeImage(productId: number, imageId: number) {
    const images = await this.repo.getImages(productId);
    const image = images.find(i => i.id === imageId);
    if (!image) throw new NotFoundError('Image not found');
    await this.storage.delete(image.filename);
    await this.repo.removeImage(productId, imageId);
  }

  async trending(storeId?: number) {
    return this.repo.findTrending(storeId, 10);
  }
}
