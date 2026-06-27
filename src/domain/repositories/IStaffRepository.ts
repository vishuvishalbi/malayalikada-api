import { IStaffUser } from '../entities/StaffUser';

export interface IStaffRepository {
  findByIdentifier(identifier: string): Promise<IStaffUser | null>;
  findById(id: number): Promise<IStaffUser | null>;
  findAll(): Promise<IStaffUser[]>;
  create(data: Omit<IStaffUser, 'id' | 'created_at' | 'updated_at'>): Promise<IStaffUser>;
  update(id: number, data: Partial<Omit<IStaffUser, 'id' | 'created_at' | 'updated_at'>>): Promise<IStaffUser | null>;
  getStoreIds(staffId: number): Promise<number[]>;
  setStoreIds(staffId: number, storeIds: number[]): Promise<void>;
}
