import sensitiveInformationDailySummarySchema from '~/schema/sensitiveInformation';
import type { ISensitiveInformationDailySummary } from '~/types';

export function createSensitiveInformationDailySummaryModel(
  mongoose: typeof import('mongoose'),
) {
  return (
    mongoose.models.SensitiveInformationDailySummary ||
    mongoose.model<ISensitiveInformationDailySummary>(
      'SensitiveInformationDailySummary',
      sensitiveInformationDailySummarySchema,
      'sensitiveinformationdailysummaries',
    )
  );
}
