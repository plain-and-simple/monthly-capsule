"use client";

import type { ChangeEvent } from "react";
import {
  CURRENT_MONTH_DAY_MAX,
  SUBMIT_OPEN_DAY_MAX,
  openDayOptionLabel,
} from "@/lib/schedule";

export function DaySelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  label,
  variant = "current",
}: {
  id?: string;
  name: string;
  value?: number;
  defaultValue?: number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  label: string;
  variant?: "open" | "current";
}) {
  const max = variant === "open" ? SUBMIT_OPEN_DAY_MAX : CURRENT_MONTH_DAY_MAX;
  const options = Array.from({ length: max }, (_, i) => i + 1).map((day) => (
    <option key={day} value={String(day)}>
      {variant === "open" ? openDayOptionLabel(day) : day}
    </option>
  ));

  if (value != null) {
    return (
      <select
        id={id}
        name={name}
        className="select"
        aria-label={label}
        value={String(value)}
        onChange={onChange}
      >
        {options}
      </select>
    );
  }

  return (
    <select
      id={id}
      name={name}
      className="select"
      aria-label={label}
      defaultValue={defaultValue != null ? String(defaultValue) : undefined}
    >
      {options}
    </select>
  );
}
