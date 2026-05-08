import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize } from '~/hooks';

type AdminHelpButtonProps = {
  title: TranslationKeys;
  description?: TranslationKeys;
  children?: ReactNode;
  className?: string;
};

export default function AdminHelpButton({
  title,
  description,
  children,
  className = '',
}: AdminHelpButtonProps) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={localize('com_ui_more_info')}
        onClick={() => setOpen(true)}
        className={`admin-button-secondary inline-flex h-8 w-8 items-center justify-center rounded-full ${className}`.trim()}
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogPortal>
          <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <OGDialogContent
            className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
            showCloseButton={true}
          >
            <OGDialogTitle className="text-lg font-semibold text-text-primary">
              {localize(title)}
            </OGDialogTitle>
            {children ?? (
              <p className="mt-4 text-sm leading-6 text-text-secondary">
                {description ? localize(description) : null}
              </p>
            )}
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    </>
  );
}
