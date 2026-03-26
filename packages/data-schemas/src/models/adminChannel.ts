import adminChannelSchema from '../schema/adminChannel';
import type { IAdminChannel } from '../types';

export function createAdminChannelModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AdminChannel ||
    mongoose.model<IAdminChannel>('AdminChannel', adminChannelSchema)
  );
}
