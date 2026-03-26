import { useCallback } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { excludedKeys, getDefaultParamsEndpoint } from 'librechat-data-provider';
import type {
  TEndpointsConfig,
  TModelsConfig,
  TConversation,
  TPreset,
} from 'librechat-data-provider';
import { getDefaultEndpoint, buildDefaultConvo } from '~/utils';
import { useGetEndpointsQuery, useGetUserEntitlementsQuery } from '~/data-provider';
import { getAllowedEndpointSelection } from '~/hooks/Endpoint/entitlements';

type TDefaultConvo = {
  conversation: Partial<TConversation>;
  preset?: Partial<TPreset> | null;
  cleanInput?: boolean;
  cleanOutput?: boolean;
};

const exceptions = new Set(['spec', 'iconURL']);

const useDefaultConvo = () => {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: modelsConfig = {} as TModelsConfig } = useGetModelsQuery();
  const { data: entitlements } = useGetUserEntitlementsQuery();

  const getDefaultConversation = useCallback(
    ({ conversation: _convo, preset, cleanInput, cleanOutput }: TDefaultConvo) => {
      const selectedEndpoint = getDefaultEndpoint({
        convoSetup: preset as TPreset,
        endpointsConfig,
      });
      const endpointSelection = getAllowedEndpointSelection({
        preferredEndpoint: selectedEndpoint,
        endpoints: Object.keys(endpointsConfig ?? {}).filter((endpoint) => !!endpointsConfig[endpoint]),
        modelsConfig,
        entitlements,
      });
      const endpoint = endpointSelection?.endpoint ?? selectedEndpoint;

      const models = endpointSelection?.models ?? modelsConfig[endpoint ?? ''] ?? [];
      const conversation = { ..._convo };
      if (cleanInput === true) {
        for (const key in conversation) {
          if (excludedKeys.has(key) && !exceptions.has(key)) {
            continue;
          }
          if (conversation[key] == null) {
            continue;
          }
          conversation[key] = undefined;
        }
      }

      const defaultParamsEndpoint = getDefaultParamsEndpoint(endpointsConfig, endpoint);

      const defaultConvo = buildDefaultConvo({
        conversation: conversation as TConversation,
        endpoint,
        lastConversationSetup: preset as TConversation,
        models,
        defaultParamsEndpoint,
      });

      if (!cleanOutput) {
        return defaultConvo;
      }

      for (const key in defaultConvo) {
        if (excludedKeys.has(key) && !exceptions.has(key)) {
          continue;
        }
        if (defaultConvo[key] == null) {
          continue;
        }
        defaultConvo[key] = undefined;
      }

      return defaultConvo;
    },
    [endpointsConfig, entitlements, modelsConfig],
  );

  return getDefaultConversation;
};

export default useDefaultConvo;
