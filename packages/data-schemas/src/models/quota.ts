import {
  quotaAccountSchema,
  quotaAllocationSchema,
  quotaGrantSchema,
  quotaLedgerEntrySchema,
  quotaPeriodSchema,
} from '~/schema/quota';
import type {
  IQuotaAccount,
  IQuotaAllocation,
  IQuotaGrant,
  IQuotaLedgerEntry,
  IQuotaPeriod,
} from '~/types';

export function createQuotaPeriodModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.QuotaPeriod || mongoose.model<IQuotaPeriod>('QuotaPeriod', quotaPeriodSchema);
}

export function createQuotaAccountModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.QuotaAccount || mongoose.model<IQuotaAccount>('QuotaAccount', quotaAccountSchema);
}

export function createQuotaLedgerEntryModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.QuotaLedgerEntry ||
    mongoose.model<IQuotaLedgerEntry>('QuotaLedgerEntry', quotaLedgerEntrySchema)
  );
}

export function createQuotaAllocationModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.QuotaAllocation ||
    mongoose.model<IQuotaAllocation>('QuotaAllocation', quotaAllocationSchema)
  );
}

export function createQuotaGrantModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.QuotaGrant || mongoose.model<IQuotaGrant>('QuotaGrant', quotaGrantSchema);
}
