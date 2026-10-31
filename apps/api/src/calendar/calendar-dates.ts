/** Date helpers working on plain YYYY-MM-DD strings in server local time. */

export function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso() {
  return toIsoDate(new Date());
}

export function addDaysIso(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return toIsoDate(new Date(year, month - 1, day + days));
}

export function daysBetween(fromIso: string, toIso: string) {
  const from = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Anniversaries of `sinceIso` that fall within [from, to], one per year,
 * starting from the first full year. Feb 29 falls back to Feb 28.
 */
export function anniversariesInRange(sinceIso: string, from: string, to: string) {
  const sinceYear = Number(sinceIso.slice(0, 4));
  const monthDay = sinceIso.slice(5, 10);
  const result: Array<{ date: string; years: number }> = [];

  for (
    let year = Math.max(Number(from.slice(0, 4)), sinceYear + 1);
    year <= Number(to.slice(0, 4));
    year += 1
  ) {
    const md = monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay;
    const date = `${year}-${md}`;
    if (date >= from && date <= to) {
      result.push({ date, years: year - sinceYear });
    }
  }

  return result;
}

export function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
