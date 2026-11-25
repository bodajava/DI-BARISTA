export { UserRole } from '@prisma/client';
import { UserRole } from '@prisma/client';

/** Can open the dashboard: read everything, handle orders and messages */
export const STAFF_ROLES: readonly UserRole[] = [UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN];

/** Catalog, settings, coupons, refunds, marketing */
export const ADMIN_ROLES: readonly UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
