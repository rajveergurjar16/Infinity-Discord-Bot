const IST_OFFSET_MS = 5.5 * 60 * 60 * 1_000;

export function parseReminderTime(input, now = Date.now()) {
  const value = String(input || '').trim();
  const relative = value.match(/^(\d+)\s*(m|min|h|hr|d|day|w|week)s?$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const unitMs = unit.startsWith('m') ? 60_000
      : unit.startsWith('h') ? 3_600_000
        : unit.startsWith('d') ? 86_400_000
          : 604_800_000;
    return amount > 0 ? now + amount * unitMs : null;
  }

  const dateTime = value.match(/^(?:(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[-/](\d{1,2})[-/](\d{4}))[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateTime) return null;

  const year = Number(dateTime[1] || dateTime[6]);
  const month = Number(dateTime[2] || dateTime[5]);
  const day = Number(dateTime[3] || dateTime[4]);
  const hour = Number(dateTime[7]);
  const minute = Number(dateTime[8]);
  const second = Number(dateTime[9] || 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
  const check = new Date(utc + IST_OFFSET_MS);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) return null;
  return utc;
}

export function normalizeRepeat(input) {
  const value = String(input || 'once').trim().toLowerCase();
  if (['once', 'daily', 'weekly', 'monthly'].includes(value)) return value;

  const custom = value.match(/^(?:every\s+)?(\d+)\s*(m|min|minute|h|hr|hour|d|day|w|week)s?$/i);
  if (!custom) return null;
  const amount = Number(custom[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) return null;
  const unitName = custom[2].toLowerCase();
  const unit = unitName.startsWith('m') ? 'm'
    : unitName.startsWith('h') ? 'h'
      : unitName.startsWith('d') ? 'd'
        : 'w';
  return `${amount}${unit}`;
}

export function nextRepeatAt(from, repeat) {
  if (repeat === 'daily') return from + 86_400_000;
  if (repeat === 'weekly') return from + 604_800_000;
  const customInterval = customRepeatIntervalMs(repeat);
  if (customInterval) return from + customInterval;
  if (repeat !== 'monthly') return null;

  const ist = new Date(from + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  const day = ist.getUTCDate();
  const hour = ist.getUTCHours();
  const minute = ist.getUTCMinutes();
  const second = ist.getUTCSeconds();
  const nextMonth = month + 1;
  const lastDay = new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate();
  return Date.UTC(year, nextMonth, Math.min(day, lastDay), hour, minute, second) - IST_OFFSET_MS;
}

export function nextFutureRepeatAt(from, repeat, now = Date.now()) {
  const fixedInterval = repeat === 'daily' ? 86_400_000
    : repeat === 'weekly' ? 604_800_000
      : customRepeatIntervalMs(repeat);
  if (fixedInterval) {
    const steps = Math.max(1, Math.floor((now - from) / fixedInterval) + 1);
    return from + steps * fixedInterval;
  }
  let next = nextRepeatAt(from, repeat);
  while (next !== null && next <= now) next = nextRepeatAt(next, repeat);
  return next;
}

function customRepeatIntervalMs(repeat) {
  const custom = normalizeRepeat(repeat)?.match(/^(\d+)([mhdw])$/);
  if (!custom) return null;
  const amount = Number(custom[1]);
  const unitMs = custom[2] === 'm' ? 60_000
    : custom[2] === 'h' ? 3_600_000
      : custom[2] === 'd' ? 86_400_000
        : 604_800_000;
  return amount * unitMs;
}

export function formatRepeat(repeat) {
  const named = ({ once: 'Once', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' })[repeat];
  if (named) return named;
  const custom = normalizeRepeat(repeat)?.match(/^(\d+)([mhdw])$/);
  if (!custom) return 'Once';
  const amount = Number(custom[1]);
  const unit = ({ m: 'minute', h: 'hour', d: 'day', w: 'week' })[custom[2]];
  return `Every ${amount} ${unit}${amount === 1 ? '' : 's'}`;
}

export function formatRepeatHint() {
  return 'Use `once`, `daily`, `weekly`, `monthly`, or a custom interval such as `2h`, `4d`, `2week`, or `every 4d`.';
}

export function formatPriority(priority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatEditableIst(timestamp) {
  const date = new Date(timestamp + IST_OFFSET_MS);
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  ].join(' ');
}

export function formatInputHint() {
  return 'Use `10m`, `2h`, `3d`, `DD-MM-YYYY HH:mm`, or `YYYY-MM-DD HH:mm`. Absolute times use IST.';
}
