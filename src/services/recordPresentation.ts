import { campusDateTimeReplacer } from './datetime';
export type Values = Record<string, unknown> | null;
export type Outcome = 'completed' | 'recorded' | 'denied' | 'attention' | 'failed';
export type Presentation = {
    action: string;
    module: string;
    module_label: string;
    outcome: Outcome;
    outcome_label: string;
    variant: 'success' | 'info' | 'warning' | 'danger' | 'default';
    record_label: string;
};
export const OUTCOMES: Record<Outcome, string> = { completed: 'Completed', recorded: 'Recorded', denied: 'Access denied', attention: 'Needs attention', failed: 'Failed' };
export const MODULES = { accounts: 'Accounts & access', vehicles: 'Vehicles & drivers', rfid: 'RFID access', parking: 'Parking operations', visitors: 'Visitors & QR', violations: 'Violations', settings: 'System settings', system: 'System activity' };
const sensitive = /password|token|secret|api.?key|reader.?key|private.?key|document|file|image|photo|_path$|license.?number|license.?no|pass.?code|qr.?code|raw.?payload/i;
const metadata = /^(created_at|updated_at|deleted_at)$/;
const names: Record<string, string> = { account_status: 'Account status', authorization_status: 'Vehicle authorization', registration_status: 'Registration status', contact_number: 'Contact number', first_name: 'First name', last_name: 'Last name', slot_id: 'Parking slot reference', vehicle_id: 'Vehicle reference', user_id: 'Account reference', transaction_status: 'Parking status', entry_datetime: 'Entry time', exit_datetime: 'Exit time', actor_label: 'Performed by', auth_result: 'Access result', email_verified_at: 'Email verified', archived: 'Archived', archived_at: 'Archived on' };
export function readable(value: string): string {
    const text = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.\\-]+/g, ' ').trim();
    if (!text)
        return 'Not specified';
    return (text[0].toUpperCase() + text.slice(1)).replace(/\b(rfid|qr|oled|api|id)\b/gi, word => word.toUpperCase());
}
export function fieldLabel(key: string): string { return names[key] || readable(key); }
export function snapshot(value: unknown): Values {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive.test(key)).map(([key, item]) => [key, Array.isArray(item) ? item.map(v => typeof v === 'object' && v ? snapshot(v) : v) : item && typeof item === 'object' ? snapshot(item) : item]));
}
function stable(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k])).join(',') + '}';
    return JSON.stringify(value) ?? 'undefined';
}
export function changes(before: unknown, after: unknown, includeUnchanged = false) {
    const previous = snapshot(before), updated = snapshot(after);
    return [...new Set([...Object.keys(previous || {}), ...Object.keys(updated || {})])].sort().map(key => ({ key, label: fieldLabel(key), before: previous?.[key], after: updated?.[key], changed: stable(previous?.[key]) !== stable(updated?.[key]) }))
        .filter(row => includeUnchanged || row.changed && !metadata.test(row.key));
}
export function valueText(key: string, value: unknown): string {
    if (value === undefined)
        return 'Not recorded';
    if (value === null || value === '')
        return 'Not set';
    if (typeof value === 'boolean')
        return value ? 'Yes' : 'No';
    if (typeof value === 'object')
        return JSON.stringify(value, campusDateTimeReplacer);
    const formatted = campusDateTimeReplacer(key, value);
    if (formatted !== value)
        return String(formatted);
    if (typeof value === 'string' && /(?:_status|_type|_result|^direction$|^operation$)/.test(key))
        return readable(value);
    return String(value);
}
export function revisionSummary(operation: string, before: unknown, after: unknown): string {
    if (operation === 'baseline')
        return 'Initial saved version';
    if (operation === 'created')
        return 'Record created';
    if (operation === 'archived')
        return 'Moved to archive';
    if (operation === 'restored')
        return 'Restored for a fresh review';
    if (operation === 'deleted')
        return 'Deletion retained in history';
    const rows = changes(before, after);
    return rows.length ? rows.slice(0, 3).map(r => r.label).join(', ') + (rows.length > 3 ? ` +${rows.length - 3} more` : '') : 'Record metadata updated';
}
export function auditPresentation(row: {
    action: string;
    auditable_type: string | null;
    auditable_id: number | null;
    presentation?: Presentation;
}): Presentation {
    if (row.presentation && Object.prototype.hasOwnProperty.call(OUTCOMES, row.presentation.outcome))
        return row.presentation;
    return { action: readable(row.action), module: 'system', module_label: 'System activity', outcome: 'recorded', outcome_label: 'Recorded', variant: 'info', record_label: `${readable(row.auditable_type?.split('\\').pop() || 'Record')} #${row.auditable_id ?? '—'}` };
}
