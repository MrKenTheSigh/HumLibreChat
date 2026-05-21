import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import {
  CircleHelpIcon,
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';
import { cn } from '~/utils';

export default function Action({
  isToolAuthenticated = false,
}: {
  authTypes?: [string, string][];
  isToolAuthenticated?: boolean;
}) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue } = methods;

  const webSearchIsEnabled = useWatch({ control, name: AgentCapabilities.web_search });

  const handleCheckboxChange = (checked: boolean) => {
    if (isToolAuthenticated) {
      setValue(AgentCapabilities.web_search, checked, { shouldDirty: true });
    } else if (webSearchIsEnabled) {
      setValue(AgentCapabilities.web_search, false, { shouldDirty: true });
    }
  };

  return (
    <>
      <HoverCard openDelay={50}>
        <div className="flex items-center">
          <Controller
            name={AgentCapabilities.web_search}
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                id="web-search-checkbox"
                checked={
                  webSearchIsEnabled ? webSearchIsEnabled : isToolAuthenticated && field.value
                }
                onCheckedChange={handleCheckboxChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
                disabled={webSearchIsEnabled ? false : !isToolAuthenticated}
                aria-labelledby="web-search-label"
              />
            )}
          />
          <label
            id="web-search-label"
            htmlFor="web-search-checkbox"
            className={cn(
              'form-check-label text-token-text-primary',
              (webSearchIsEnabled || isToolAuthenticated) && 'cursor-pointer',
            )}
          >
            {localize('com_ui_web_search')}
          </label>
          <div className="ml-2 flex gap-2">
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center"
                aria-label={localize('com_agents_search_info')}
              >
                <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
              </button>
            </HoverCardTrigger>
          </div>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">{localize('com_agents_search_info')}</p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
    </>
  );
}
