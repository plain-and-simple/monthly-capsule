import { CHICAGO_TZ } from "@/lib/constants";

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

export function chicagoWeekdayTheDay(year: number, month: number, day: number): string {
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: CHICAGO_TZ,
  }).format(utcNoon);
  return `${weekday} the ${ordinal(day)}`;
}
