import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from './migrations/20261027_045_roles_permissions';

const routesDir = join(__dirname, '../../presentation/routes');
const used = readdirSync(routesDir)
  .filter((f) => f.endsWith('.routes.ts'))
  .flatMap((f) => [...readFileSync(join(routesDir, f), 'utf8').matchAll(/requirePermission\('([^']+)'\)/g)].map((m) => m[1]));
const codes = PERMISSIONS.map((p) => p.code);

describe('roles and permissions seed', () => {
  it('every permission a route requires exists in the catalogue', () => {
    expect(used.length).toBeGreaterThan(0);
    expect(codes).toEqual(expect.arrayContaining(used));
  });

  it('every catalogue permission is enforced by some route', () => {
    expect([...new Set(used)].sort()).toEqual([...codes].sort());
  });

  it('only grants known roles and permissions', () => {
    const roles = ROLES.map((r) => r.name);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(roles).toContain(role);
      expect(codes).toEqual(expect.arrayContaining(perms));
    }
  });

  it('admin holds every permission', () => {
    expect([...ROLE_PERMISSIONS.admin].sort()).toEqual([...codes].sort());
  });

  it('catalog_manager manages products, images, stock and prices only', () => {
    expect([...ROLE_PERMISSIONS.catalog_manager].sort()).toEqual([
      'pricing:read', 'pricing:write', 'products:create', 'products:delete',
      'products:images', 'products:update', 'stock:read', 'stock:write',
    ]);
  });
});
