export interface IAccountDeletionRepository {
  /**
   * Atomically anonymizes the customer and purges their personal data. Returns
   * false (and changes nothing) if the customer is missing or already anonymized.
   */
  anonymizeCustomer(customerId: number): Promise<boolean>;
}
