import { IDeliverySlabRepository } from '../../domain/repositories/IDeliverySlabRepository';
import { IDeliverySlab } from '../../domain/entities/DeliverySlab';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';

export class DeliveryService {
  constructor(private repo: IDeliverySlabRepository) {}

  async list(activeOnly: boolean): Promise<IDeliverySlab[]> {
    return activeOnly ? this.repo.findActive() : this.repo.findAll();
  }

  async create(data: {
    min_weight_kg: number;
    max_weight_kg: number | null;
    fee_nzd: number;
    is_active?: boolean;
  }): Promise<IDeliverySlab> {
    this.validateRange(data.min_weight_kg, data.max_weight_kg);
    await this.checkOverlap(data.min_weight_kg, data.max_weight_kg);
    return this.repo.create({
      min_weight_kg: data.min_weight_kg,
      max_weight_kg: data.max_weight_kg,
      fee_nzd: data.fee_nzd,
      is_active: data.is_active ?? true,
    });
  }

  async update(
    id: number,
    data: Partial<{ min_weight_kg: number; max_weight_kg: number | null; fee_nzd: number; is_active: boolean }>
  ): Promise<IDeliverySlab> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Delivery slab not found');

    const min = data.min_weight_kg ?? existing.min_weight_kg;
    const max = 'max_weight_kg' in data ? data.max_weight_kg! : existing.max_weight_kg;
    const isActive = data.is_active ?? existing.is_active;

    this.validateRange(min, max);
    if (isActive) await this.checkOverlap(min, max, id);

    const updated = await this.repo.update(id, data);
    return updated!;
  }

  async remove(id: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Delivery slab not found');
    await this.repo.delete(id);
  }

  /**
   * Returns the delivery fee in NZD for the given total cart weight.
   * Product weight is stored in kilograms per unit; item contribution = product.weight * quantity.
   * Products with null weight contribute 0 kg.
   * Returns 0 if weight is 0 or no active slab covers it.
   */
  async feeForWeight(weightKg: number): Promise<number> {
    if (weightKg === 0) return 0;
    const slabs = await this.repo.findActive();
    const match = slabs.find(
      s => s.min_weight_kg <= weightKg && (s.max_weight_kg === null || weightKg < s.max_weight_kg)
    );
    return match ? Number(match.fee_nzd) : 0;
  }

  private validateRange(min: number, max: number | null): void {
    if (max !== null && max <= min) {
      throw new ValidationError('max_weight_kg must be greater than min_weight_kg');
    }
  }

  private async checkOverlap(min: number, max: number | null, excludeId?: number): Promise<void> {
    const activeSlabs = await this.repo.findActive();
    const slabs = excludeId ? activeSlabs.filter(s => s.id !== excludeId) : activeSlabs;

    for (const s of slabs) {
      // Two slabs overlap if they share any point in [min, max)
      // Slab A: [s.min, s.max)  — s.max=null means open-ended
      // Slab B: [min, max)      — max=null means open-ended
      // They DON'T overlap only when: A ends before B starts, or B ends before A starts
      const aEndsBeforeB = s.max_weight_kg !== null && s.max_weight_kg <= min;
      const bEndsBeforeA = max !== null && max <= s.min_weight_kg;
      if (!aEndsBeforeB && !bEndsBeforeA) {
        throw new ValidationError(
          `Slab overlaps with existing active slab [${s.min_weight_kg}, ${s.max_weight_kg ?? '∞'})`
        );
      }
    }
  }
}
