import activityLogSchema from '~/schema/activityLog';
import type { IActivityLog } from '~/types';

export function createActivityLogModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ActivityLog ||
    mongoose.model<IActivityLog>('ActivityLog', activityLogSchema, 'auditevents')
  );
}
