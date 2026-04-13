import type { Model } from 'mongoose';
import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';
import messageSchema from '~/schema/message';

interface SchemaWithMongoMeiliFlag {
  __mongoMeiliApplied?: boolean;
}

const searchEnabled = process.env.SEARCH != null && process.env.SEARCH.toLowerCase() === 'true';

/**
 * Creates or returns the Message model using the provided mongoose instance and schema
 */
export function createMessageModel(
  mongoose: typeof import('mongoose'),
): Model<t.IMessage> & Partial<SchemaWithMeiliMethods> {
  if (mongoose.models.Message) {
    return mongoose.models.Message as Model<t.IMessage> & Partial<SchemaWithMeiliMethods>;
  }

  const schema = messageSchema as typeof messageSchema & SchemaWithMongoMeiliFlag;
  if (
    searchEnabled &&
    process.env.MEILI_HOST &&
    process.env.MEILI_MASTER_KEY &&
    schema.__mongoMeiliApplied !== true
  ) {
    messageSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      indexName: 'messages',
      primaryKey: 'messageId',
    });
    schema.__mongoMeiliApplied = true;
  }

  return mongoose.model<t.IMessage>('Message', messageSchema) as Model<t.IMessage> &
    Partial<SchemaWithMeiliMethods>;
}
