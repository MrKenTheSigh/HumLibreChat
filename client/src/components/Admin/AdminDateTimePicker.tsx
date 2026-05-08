import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalize } from '~/hooks';

type AdminDateTimePickerMode = 'date' | 'datetime';

type AdminDateTimePickerProps = {
  ariaLabel: string;
  mode?: AdminDateTimePickerMode;
  value: string;
  onChange: (value: string) => void;
};

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatInputDate(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

function parseDatePart(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimePart(value: string) {
  const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  return {
    hours: match?.[1] ?? '00',
    minutes: match?.[2] ?? '00',
    seconds: match?.[3] ?? '00',
  };
}

function buildMonthDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_value, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function isSameDate(left: Date | null, right: Date) {
  return (
    left != null &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatAdminDateValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}/${dateOnlyMatch[2]}/${dateOnlyMatch[3]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('/');
}

export function formatAdminDateTimeValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const localDateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    value,
  );
  if (localDateTimeMatch) {
    return `${localDateTimeMatch[1]}/${localDateTimeMatch[2]}/${localDateTimeMatch[3]} ${
      localDateTimeMatch[4]
    }:${localDateTimeMatch[5]}:${localDateTimeMatch[6] ?? '00'}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatAdminDateValue(date.toISOString())} ${padDatePart(date.getHours())}:${padDatePart(
    date.getMinutes(),
  )}:${padDatePart(date.getSeconds())}`;
}

export default function AdminDateTimePicker({
  ariaLabel,
  mode = 'date',
  value,
  onChange,
}: AdminDateTimePickerProps) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const lang = i18n.language || document.documentElement.lang || navigator.language;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = useMemo(() => parseDatePart(value), [value]);
  const [viewDate, setViewDate] = useState(selectedDate ?? new Date());
  const { hours, minutes, seconds } = parseTimePart(value);
  const displayValue =
    mode === 'datetime' ? formatAdminDateTimeValue(value) : formatAdminDateValue(value);
  const openPicker = () => {
    setViewDate(selectedDate ?? new Date());
    setIsOpen(true);
  };
  const monthDays = useMemo(() => buildMonthDays(viewDate), [viewDate]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(lang || undefined, { month: 'long', year: 'numeric' }).format(viewDate),
    [lang, viewDate],
  );
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_value, index) =>
        new Intl.DateTimeFormat(lang || undefined, { weekday: 'short' }).format(
          new Date(2026, 1, index + 1),
        ),
      ),
    [lang],
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsidePointer);
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer);
  }, [isOpen]);

  const updateMonth = (offset: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDate = (date: Date) => {
    const nextDate = formatInputDate(date);
    if (mode === 'date') {
      onChange(nextDate);
      setIsOpen(false);
      return;
    }

    onChange(`${nextDate}T${hours}:${minutes}:${seconds}`);
  };

  const updateTime = (part: 'hours' | 'minutes' | 'seconds', nextValue: string) => {
    const date = value ? value.slice(0, 10) : formatInputDate(selectedDate ?? new Date());
    const nextTime = {
      hours,
      minutes,
      seconds,
      [part]: nextValue.padStart(2, '0').slice(-2),
    };
    onChange(`${date}T${nextTime.hours}:${nextTime.minutes}:${nextTime.seconds}`);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex min-h-[38px] w-full items-center justify-between rounded-xl border border-border-medium bg-background px-3 py-2 text-left text-sm text-text-primary"
        aria-label={ariaLabel}
        onClick={openPicker}
      >
        <span className={displayValue ? undefined : 'text-text-secondary'}>
          {displayValue || localize('com_ui_select')}
        </span>
        <CalendarDays className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 rounded-2xl border border-border-medium bg-surface-primary p-3 text-text-primary shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="admin-subpanel flex h-8 w-8 items-center justify-center rounded-lg border"
              aria-label={localize('com_ui_back')}
              onClick={() => updateMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="text-sm font-medium">{monthLabel}</div>
            <button
              type="button"
              className="admin-subpanel flex h-8 w-8 items-center justify-center rounded-lg border"
              aria-label={localize('com_ui_next')}
              onClick={() => updateMonth(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-text-secondary">
            {weekdayLabels.map((weekday) => (
              <div key={weekday} className="py-1">
                {weekday}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthDays.map((date) => {
              const isCurrentMonth = date.getMonth() === viewDate.getMonth();
              const isSelected = isSameDate(selectedDate, date);

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={
                    isSelected
                      ? 'h-8 rounded-lg border border-border-medium bg-text-primary text-surface-primary'
                      : 'h-8 rounded-lg border border-transparent text-text-primary hover:border-border-medium hover:bg-background'
                  }
                  onClick={() => selectDate(date)}
                >
                  <span className={isCurrentMonth ? undefined : 'text-text-secondary'}>
                    {date.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {mode === 'datetime' ? (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-light pt-3">
              {[
                ['hours', hours],
                ['minutes', minutes],
                ['seconds', seconds],
              ].map(([part, partValue]) => (
                <input
                  key={part}
                  type="number"
                  min={0}
                  max={part === 'hours' ? 23 : 59}
                  value={partValue}
                  onChange={(event) =>
                    updateTime(part as 'hours' | 'minutes' | 'seconds', event.target.value)
                  }
                  className="rounded-lg border border-border-medium bg-background px-2 py-1 text-center text-sm text-text-primary"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
