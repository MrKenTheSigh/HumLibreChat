import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize } from '~/hooks';

type AdminLayoutProps = {
  title: string;
  description?: string | null;
  eyebrow?: TranslationKeys | null;
  hideHeader?: boolean;
  children: ReactNode;
};

export default function AdminLayout({
  title,
  description,
  eyebrow = 'com_ui_admin',
  hideHeader = false,
  children,
}: AdminLayoutProps) {
  const localize = useLocalize();

  return (
    <div className="flex h-full flex-col gap-8">
      {hideHeader ? null : (
        <div className="admin-hero rounded-3xl border p-6">
          <div className="space-y-3">
            {eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-secondary">
                {localize(eyebrow)}
              </p>
            ) : null}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
              {description ? (
                <p className="max-w-3xl text-sm leading-6 text-text-secondary">{description}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
