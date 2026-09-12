// src/features/dailytasks/DateFilter.tsx
// Filtering the daily task list by the date the card already prints.
//
// The row shows "Done <date>" once a task is finished and "Started <date>"
// before that. This reads the same value, so a task can never disappear for a
// reason that is not written on the card - which is the fastest way to make
// somebody stop trusting a filter.
import type { DailyTask } from "./useDailyTasks";

export type DateRange = {
  preset: "any" | "today" | "7d" | "month" | "custom";
  from: string;
  to: string;
};

export const ANY_DATE: DateRange = { preset: "any", from: "", to: "" };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The date the card prints: when it was done, else when it was started.
 *
 * Built from local parts rather than slicing the ISO string, because the row
 * formats in the viewer's timezone too - a task finished at 7pm would
 * otherwise filter as the following day.
 */
export function cardDateYmd(task: DailyTask) {
  return ymd(new Date(task.completed_at ?? task.created_at));
}

/** Null means no limit at all. */
function spanOf(range: DateRange): { from: string; to: string } | null {
  const now = new Date();

  if (range.preset === "any") return null;

  if (range.preset === "today") {
    const t = ymd(now);
    return { from: t, to: t };
  }

  if (range.preset === "7d") {
    const back = new Date(now);
    // Six days back plus today is seven days inclusive.
    back.setDate(back.getDate() - 6);
    return { from: ymd(back), to: ymd(now) };
  }

  if (range.preset === "month") {
    return {
      from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
      to: ymd(now),
    };
  }

  // Custom. Either end may be left blank, which means open-ended that way.
  if (!range.from && !range.to) return null;
  return { from: range.from, to: range.to };
}

export function matchesDate(task: DailyTask, range: DateRange) {
  const span = spanOf(range);
  if (!span) return true;

  const on = cardDateYmd(task);
  if (span.from && on < span.from) return false;
  if (span.to && on > span.to) return false;

  return true;
}

const control =
  "rounded-xl border border-[#DCE4EE] bg-white px-3 py-2 text-[16px] text-[#1A1A2E]";

export function DateFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filter by date"
        className={control}
        onChange={(e) =>
          onChange({
            ...value,
            preset: e.target.value as DateRange["preset"],
          })
        }
        value={value.preset}
      >
        <option value="any">Any time</option>
        <option value="today">Today</option>
        <option value="7d">Last 7 days</option>
        <option value="month">This month</option>
        <option value="custom">Custom…</option>
      </select>

      {value.preset === "custom" && (
        <>
          <input
            aria-label="From"
            className={`${control} block w-full min-w-0 appearance-none sm:w-auto`}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            type="date"
            value={value.from}
          />
          <span className="text-[16px] text-[#8291A5]">to</span>
          <input
            aria-label="To"
            className={`${control} block w-full min-w-0 appearance-none sm:w-auto`}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            type="date"
            value={value.to}
          />
        </>
      )}
    </div>
  );
}