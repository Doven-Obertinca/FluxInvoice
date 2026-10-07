import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '@flux/db';
import { members } from '@flux/db';
import { AppError } from '@flux/shared';
export type Role = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'MEMBER' | 'VIEWER';
export type Permission =
  | 'read'
  | 'customer:write'
  | 'invoice:write'
  | 'invoice:finalize'
  | 'company:write'
  | 'members:read';
const grants: Record<Role, readonly Permission[]> = {
  OWNER: [
    'read',
    'customer:write',
    'invoice:write',
    'invoice:finalize',
    'company:write',
    'members:read',
  ],
  ADMIN: [
    'read',
    'customer:write',
    'invoice:write',
    'invoice:finalize',
    'company:write',
    'members:read',
  ],
  ACCOUNTANT: ['read', 'customer:write', 'invoice:write', 'invoice:finalize'],
  MEMBER: ['read', 'customer:write', 'invoice:write'],
  VIEWER: ['read'],
};
export function can(role: Role, permission: Permission) {
  return grants[role].includes(permission);
}
// userId must originate from a verified session, never request JSON.
export interface Principal {
  userId: string;
  organizationId: string;
  requestId: string;
}
export async function authorize(
  db: Database | Transaction,
  principal: Principal,
  permission: Permission,
) {
  const [membership] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.organizationId, principal.organizationId),
        eq(members.userId, principal.userId),
      ),
    );
  if (!membership || !can(membership.role, permission))
    throw new AppError('AUTHORIZATION', 'Keine Berechtigung.');
  return membership;
}
