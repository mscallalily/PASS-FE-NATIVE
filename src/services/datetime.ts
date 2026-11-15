// API instants use UTC or an explicit offset. Legacy SQL datetimes are UTC.
// Calendar-only values (license expiry, authorization dates) stay calendar dates.
export const CAMPUS_TIMEZONE = 'Asia/Manila';
type DateInput = string | Date | null | undefined;
const DATE_TIME: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
const DATE_ONLY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
/** Parse a server timestamp without borrowing the viewer's device timezone. */
export function parseApiDateTime(value: DateInput): Date | null {
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    if (typeof value !== 'string' || !value)
        return null;
    const text = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(text);
    if (!match)
        return null;
    const [, y, m, d, h, min, sec] = match;
    const year = Number(y), month = Number(m), day = Number(d);
    if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
        || Number(h ?? 0) > 23 || Number(min ?? 0) > 59 || Number(sec ?? 0) > 59)
        return null;
    let iso: string;
    if (h === undefined) {
        iso = `${y}-${m}-${d}T00:00:00+08:00`;
    }
    else {
        const fraction = match[7] ? `.${match[7].slice(0, 3).padEnd(3, '0')}` : '';
        const offset = match[8]?.toUpperCase().replace(/([+-]\d{2})(\d{2})$/, '$1:$2') ?? 'Z';
        iso = `${y}-${m}-${d}T${h}:${min}:${sec ?? '00'}${fraction}${offset}`;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}
/** Every displayed clock time is Philippine Time, regardless of device settings. */
export function formatCampusDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = DATE_TIME): string {
    const date = parseApiDateTime(value);
    if (!date)
        return '—';
    const text = date.toLocaleString('en-PH', { ...options, hour12: true, timeZone: CAMPUS_TIMEZONE });
    return options.hour || options.minute || options.second || options.timeStyle ? `${text} PHT` : text;
}
export function formatCampusDate(value: DateInput, options: Intl.DateTimeFormatOptions = DATE_ONLY): string {
    return formatCampusDateTime(value, options);
}
/** Philippine calendar date for date inputs, filters and export filenames. */
export function campusDateKey(value: DateInput = new Date()): string {
    const date = parseApiDateTime(value);
    if (!date)
        return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
        timeZone: CAMPUS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}
/** Human-readable retained values; JSON formatting never changes the stored record. */
export function campusDateTimeReplacer(key: string, value: unknown): unknown {
    if (typeof value !== 'string' || !/(?:_at|_datetime|valid_from|valid_until)$/.test(key)
        || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value))
        return value;
    return parseApiDateTime(value) ? formatCampusDateTime(value) : value;
}
