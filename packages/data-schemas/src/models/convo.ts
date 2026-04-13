import type { Model } from 'mongoose';
import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';
import convoSchema from '~/schema/convo';

interface SchemaWithMongoMeiliFlag {
  __mongoMeiliApplied?: boolean;
}

const searchEnabled = process.env.SEARCH != null && process.env.SEARCH.toLowerCase() === 'true';

/**
 * Creates or returns the Conversation model using the provided mongoose instance and schema
 */
export function createConversationModel(
  mongoose: typeof import('mongoose'),
): Model<t.IConversation> & Partial<SchemaWithMeiliMethods> {
  if (mongoose.models.Conversation) {
    return mongoose.models.Conversation as Model<t.IConversation> & Partial<SchemaWithMeiliMethods>;
  }

  const schema = convoSchema as typeof convoSchema & SchemaWithMongoMeiliFlag;
  if (
    searchEnabled &&
    process.env.MEILI_HOST &&
    process.env.MEILI_MASTER_KEY &&
    schema.__mongoMeiliApplied !== true
  ) {
    convoSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      /** Note: Will get created automatically if it doesn't exist already */
      indexName: 'convos',
      primaryKey: 'conversationId',
    });
    schema.__mongoMeiliApplied = true;
  }

  return mongoose.model<t.IConversation>('Conversation', convoSchema) as Model<t.IConversation> &
    Partial<SchemaWithMeiliMethods>;
}
