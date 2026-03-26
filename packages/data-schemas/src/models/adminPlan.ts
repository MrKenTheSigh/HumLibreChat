import adminPlanSchema from '~/schema/adminPlan';
import type { IAdminPlan } from '~/types';

export function createAdminPlanModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.AdminPlan || mongoose.model<IAdminPlan>('AdminPlan', adminPlanSchema);
}
