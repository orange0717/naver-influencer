/**
 * @deprecated access-control.ts 로 이전됨. 기존 import 호환을 위해 re-export 유지.
 */
export {
  isAdmin,
  isAdminFromProfile,
  isAdminAsync,
  hasActiveSubscription,
  isRestricted,
  isRestrictedByUserId,
  requireAdmin,
  requirePaidAccess,
  requirePaidPlan,
  getPaywallContext,
  requireInfluencerPlan,
} from './access-control';
