export function getIsoWeek(date = new Date()): string {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function getIsoWeekDateRange(date = new Date()): { start: Date; end: Date } {
  const current = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = current.getUTCDay() || 7;
  const start = new Date(current);
  start.setUTCDate(current.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

export function getIsoWeekDateRangeFromIso(isoWeek: string): { start: Date; end: Date } {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) throw new Error(`Settimana ISO non valida: ${isoWeek}`);

  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const start = new Date(januaryFourth);
  start.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + (week - 1) * 7);
  if (week < 1 || week > 53 || getIsoWeek(start) !== isoWeek) {
    throw new Error(`Settimana ISO non valida: ${isoWeek}`);
  }

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

function formatItalianDate(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatIsoWeekDateRange(isoWeek: string): string {
  const { start, end } = getIsoWeekDateRangeFromIso(isoWeek);
  return `${formatItalianDate(start)} – ${formatItalianDate(end)}`;
}
