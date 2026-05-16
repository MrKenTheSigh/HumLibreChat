import adminSystemSettingSchema from '../schema/adminSystemSetting';
import type { IAdminSystemSetting } from '../types';

export function createAdminSystemSettingModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AdminSystemSetting ||
    mongoose.model<IAdminSystemSetting>('AdminSystemSetting', adminSystemSettingSchema)
  );
}
