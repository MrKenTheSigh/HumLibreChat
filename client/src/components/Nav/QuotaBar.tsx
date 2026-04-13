import { useLocalize } from '~/hooks';
import { cn, formatCreditCompact, formatCreditExact } from '~/utils';

type QuotaBarProps = {
  periodTotalCredits: number;
  periodUsedCredits: number;
  periodRemainingCredits: number;
  usageRatio: number;
  className?: string;
};

function getQuotaTone(usageRatio: number): string {
  if (usageRatio >= 0.9) {
    return 'bg-red-500';
  }
  if (usageRatio >= 0.8) {
    return 'bg-amber-500';
  }
  if (usageRatio >= 0.5) {
    return 'bg-sky-500';
  }
  return 'bg-emerald-500';
}

export default function QuotaBar({
  periodTotalCredits,
  periodUsedCredits: _periodUsedCredits,
  periodRemainingCredits,
  usageRatio,
  className,
}: QuotaBarProps) {
  const localize = useLocalize();
  const remainingRatio =
    periodTotalCredits > 0 ? Math.min(periodRemainingCredits / periodTotalCredits, 1) : 0;

  return (
    <div
      className={cn(
        'mx-3 my-2 rounded-xl border border-border-medium bg-surface-secondary px-3 py-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-text-primary">Credits</span>
        <span
          className="text-right text-text-secondary"
          title={`${formatCreditExact(periodRemainingCredits)} / ${formatCreditExact(periodTotalCredits)}`}
        >
          {formatCreditCompact(periodRemainingCredits)} / {formatCreditCompact(periodTotalCredits)}
        </span>
      </div>
      <div className="relative mt-2 h-5 overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            getQuotaTone(usageRatio),
          )}
          style={{ width: `${remainingRatio * 100}%` }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm font-medium text-text-primary">
          {Math.round(Math.min(Math.max(remainingRatio, 0), 1) * 100)}%
        </div>
      </div>
    </div>
  );
}
