"use client";

import {
  CURRENT_MONTH_DAY_MAX,
  SUBMIT_OPEN_DAY_MAX,
  openDayOptionLabel,
} from "@/lib/schedule";

export function DaySelect({
  id,
  name,
  defaultValue,
  label,
  variant = "current",
}: {
  id?: string;
  name: string;
  defaultValue: number;
  label: string;
  variant?: "open" | "current";
}) {
  const max = variant === "open" ? SUBMIT_OPEN_DAY_MAX : CURRENT_MONTH_DAY_MAX;
  return (
    <select id={id} name={name} className="select" aria-label={label} defaultValue={defaultValue}>
      {Array.from({ length: max }, (_, i) => i + 1).map((day) => (
        <option key={day} value={day}>
          {variant === "open" ? openDayOptionLabel(day) : day}
        </option>
      ))}
    </select>
  );
}
