export type RecordEntity = 'users' | 'vehicles';
export type ArchiveState = 'active' | 'archived';
export type Page<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    summary?: {
        active: number;
        archived: number;
    };
};
export type ArchiveRow = {
    id: number;
    identifier: string;
    name: string;
    email?: string;
    owner?: string;
    owner_code?: string;
    status: string;
    archived_at: string | null;
};
export type RetainedDocument = {
    side: 'before' | 'after';
    field: string;
};
export type RecordRevision = {
    revision_id: number;
    record_type: string;
    record_type_label?: string;
    record_label?: string;
    record_id: string;
    operation: string;
    actor_label: string | null;
    source: string | null;
    recorded_at: string;
    before_values: unknown;
    after_values: unknown;
    documents: RetainedDocument[];
};
export type HistoryResponse = {
    history: Page<RecordRevision>;
    entities: Record<string, string>;
    started_at: string | null;
};
export type HistoryFilters = {
    search: string;
    record_type: string;
    record_id: string;
    operation: string;
    date_from: string;
    date_to: string;
    include_baseline: boolean;
    scope: 'business' | 'all';
};
export const DEFAULT_HISTORY_FILTERS: HistoryFilters = { search: '', record_type: '', record_id: '', operation: '', date_from: '', date_to: '', include_baseline: false, scope: 'business' };
const encode = (entries: [
    string,
    string
][]) => entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
export function historyQuery(filters: HistoryFilters, page: number): string {
    const pairs: [
        string,
        string
    ][] = [['page', String(page)], ['scope', filters.scope], ['include_baseline', filters.include_baseline ? '1' : '0']];
    for (const key of ['search', 'record_type', 'record_id', 'operation', 'date_from', 'date_to'] as const)
        if (filters[key].trim())
            pairs.push([key, filters[key].trim()]);
    return '/admin/record-history?' + encode(pairs);
}
export function archiveQuery(entity: RecordEntity, state: ArchiveState, page: number, search: string): string {
    return `/admin/record-archives/${entity}?` + encode([['state', state], ['page', String(page)], ...(search.trim() ? [['search', search.trim()] as [
                string,
                string
            ]] : [])]);
}
export function historyProblem(filters: HistoryFilters): string | null {
    const validDate = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
            return false;
        const [year, month, day] = value.split('-').map(Number);
        return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
    };
    for (const key of ['date_from', 'date_to'] as const)
        if (filters[key] && !validDate(filters[key]))
            return 'Use a valid date in YYYY-MM-DD format.';
    if (filters.date_from && filters.date_to && filters.date_to < filters.date_from)
        return 'The end date must be on or after the start date.';
    if (filters.search.trim().length > 100 || filters.record_id.trim().length > 128)
        return 'Shorten the search or record reference before applying the filters.';
    return null;
}
export function archiveProblem(reason: string): string | null {
    const length = [...reason.trim()].length;
    return length < 5 || length > 500 ? 'Enter a reason with 5 to 500 characters.' : null;
}
export function expectPage<T>(payload: Page<T>): Page<T> {
    if (!payload || !Array.isArray(payload.data) || !Number.isInteger(payload.current_page) || payload.current_page < 1 || !Number.isInteger(payload.last_page) || payload.last_page < 1 || !Number.isInteger(payload.total) || payload.total < 0)
        throw new Error('PASS returned an incomplete records page. Refresh and try again.');
    return payload;
}
export function expectHistory(payload: HistoryResponse): HistoryResponse {
    expectPage(payload?.history);
    if (!payload.entities || typeof payload.entities !== 'object' || Array.isArray(payload.entities))
        throw new Error('PASS returned incomplete history filters. Refresh and try again.');
    if (!payload.history.data.every(row => row && Number.isInteger(row.revision_id) && row.revision_id > 0 && typeof row.record_type === 'string' && typeof row.operation === 'string' && Array.isArray(row.documents)))
        throw new Error('PASS returned incomplete saved changes. Refresh and try again.');
    return payload;
}
export function expectArchives(payload: Page<ArchiveRow>): Page<ArchiveRow> {
    expectPage(payload);
    if (!payload.data.every(row => row && Number.isInteger(row.id) && row.id > 0 && typeof row.identifier === 'string' && typeof row.status === 'string' && (row.archived_at === null || typeof row.archived_at === 'string')))
        throw new Error('PASS returned incomplete archive records. Refresh and try again.');
    return payload;
}
export function documentPath(revisionId: number, document: RetainedDocument): string {
    if (!Number.isInteger(revisionId) || revisionId < 1 || !['before', 'after'].includes(document.side) || !/^[a-z][a-z0-9_]{0,99}$/.test(document.field))
        throw new Error('This historical document reference is invalid. Refresh the history.');
    return `/admin/record-history/${revisionId}/documents/${encodeURIComponent(document.field)}?side=${document.side}`;
}
