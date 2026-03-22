const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const cloneDate = (value: Date) => new Date(value.getTime());

const withStableTime = (base: Date, value: Date) => {
  const next = cloneDate(value);
  // Use midday to avoid local/UTC date drift when callers later format to ISO date strings.
  next.setHours(
    base.getHours() === 0 && base.getMinutes() === 0 && base.getSeconds() === 0 && base.getMilliseconds() === 0
      ? 12
      : base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  );
  return next;
};

const addDays = (value: Date, days: number) => {
  const next = cloneDate(value);
  next.setDate(next.getDate() + days);
  return next;
};

const endOfMonth = (value: Date) => withStableTime(value, new Date(value.getFullYear(), value.getMonth() + 1, 0));

const parseWeekdayReference = (normalized: string, now: Date) => {
  const weekdayMatch = normalized.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (!weekdayMatch) {
    return undefined;
  }

  const targetDay = WEEKDAY_INDEX[weekdayMatch[1]];
  const currentDay = now.getDay();
  let delta = targetDay - currentDay;
  if (delta <= 0) {
    delta += 7;
  }

  return addDays(now, delta);
};

export const parseConversationDate = (value: unknown, now: Date = new Date()) => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "today") {
    return cloneDate(now);
  }

  if (normalized === "tomorrow") {
    return addDays(now, 1);
  }

  if (normalized === "yesterday") {
    return addDays(now, -1);
  }

  if (normalized === "next week") {
    return addDays(now, 7);
  }

  const weekMatch = normalized.match(/^(?:in\s+)?(\d+)\s+weeks?$/);
  if (weekMatch) {
    const weeks = Number.parseInt(weekMatch[1], 10);
    if (weeks > 0) {
      return addDays(now, weeks * 7);
    }
  }

  if (normalized === "end of month") {
    return endOfMonth(now);
  }

  const weekdayReference = parseWeekdayReference(normalized, now);
  if (weekdayReference) {
    return weekdayReference;
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(normalized)) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
