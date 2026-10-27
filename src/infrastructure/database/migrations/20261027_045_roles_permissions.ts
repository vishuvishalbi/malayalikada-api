import type { Knex } from 'knex';

/** Seed data, exported so tests can check route permissions against it. Later permissions get their own migration. */
export const ROLES = [
  { name: 'admin', label: 'Admin', description: 'Full access' },
  { name: 'worker', label: 'Worker', description: 'Fulfils orders for assigned stores' },
  { name: 'catalog_manager', label: 'Catalog manager', description: 'Manages products, images, stock and prices' },
];

export const PERMISSIONS = [
  { code: 'products:create', module: 'products', description: 'Create products' },
  { code: 'products:update', module: 'products', description: 'Edit products' },
  { code: 'products:delete', module: 'products', description: 'Delete products' },
  { code: 'products:images', module: 'products', description: 'Upload and remove product images' },
  { code: 'products:import', module: 'products', description: 'Bulk import products from CSV' },
  { code: 'products:export', module: 'products', description: 'Export products to CSV' },
  { code: 'stock:read', module: 'stock', description: 'View stock levels' },
  { code: 'stock:write', module: 'stock', description: 'Set stock levels' },
  { code: 'pricing:read', module: 'pricing', description: 'View store prices and costs' },
  { code: 'pricing:write', module: 'pricing', description: 'Set store prices and costs' },
];

const CATALOG_MANAGER = PERMISSIONS.map((p) => p.code).filter((c) => !/^products:(import|export)$/.test(c));

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: PERMISSIONS.map((p) => p.code),
  catalog_manager: CATALOG_MANAGER,
};

/**
 * Roles and permissions are keyed by name. `staff_users.role` becomes a
 * foreign key into `roles`, so existing admin/worker rows stay valid and old
 * code that writes 'admin'/'worker' keeps working.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', (t) => {
    t.string('name', 32).primary();
    t.string('label', 64).notNullable();
    t.string('description', 255).nullable();
    t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('permissions', (t) => {
    t.string('code', 64).primary();
    t.string('module', 32).notNullable();
    t.string('description', 255).notNullable();
  });
  await knex.schema.createTable('role_permissions', (t) => {
    t.string('role', 32).notNullable().references('name').inTable('roles').onUpdate('CASCADE').onDelete('CASCADE');
    t.string('permission', 64).notNullable().references('code').inTable('permissions').onUpdate('CASCADE').onDelete('CASCADE');
    t.primary(['role', 'permission']);
  });

  await knex('roles').insert(ROLES);
  await knex('permissions').insert(PERMISSIONS);
  await knex('role_permissions').insert(
    Object.entries(ROLE_PERMISSIONS).flatMap(([role, perms]) => perms.map((permission) => ({ role, permission })))
  );

  await knex.raw('ALTER TABLE staff_users MODIFY role VARCHAR(32) NOT NULL');
  await knex.schema.alterTable('staff_users', (t) => {
    t.foreign('role', 'fk_staff_users_role').references('name').inTable('roles').onUpdate('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Staff on a role the old enum can't hold are deactivated rather than lost.
  await knex('staff_users').whereNotIn('role', ['worker', 'admin']).update({ role: 'worker', is_active: 0 });
  await knex.schema.alterTable('staff_users', (t) => t.dropForeign('role', 'fk_staff_users_role'));
  await knex.raw("ALTER TABLE staff_users MODIFY role ENUM('worker','admin') NOT NULL");
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
}
