import {
  managerReviewBatchSchema,
  managerReviewItemSchema,
} from '~/schema/managerReview';
import type { IManagerReviewBatch, IManagerReviewItem } from '~/types';

export function createManagerReviewBatchModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ManagerReviewBatch ||
    mongoose.model<IManagerReviewBatch>('ManagerReviewBatch', managerReviewBatchSchema)
  );
}

export function createManagerReviewItemModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ManagerReviewItem ||
    mongoose.model<IManagerReviewItem>('ManagerReviewItem', managerReviewItemSchema)
  );
}
