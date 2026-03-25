import type { ReactNode } from 'react';

type AdminLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export default function AdminLayout({ title, description, children }: AdminLayoutProps) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="max-w-3xl text-sm text-text-secondary">{description}</p>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
