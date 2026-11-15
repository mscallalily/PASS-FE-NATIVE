export type ListMeta = { current_page: number; per_page: number; last_page: number; total: number; from?: number | null; to?: number | null };
export function listMeta(value: unknown, legacyCount = 0): ListMeta {
    // Older servers returned one complete list; current servers always send metadata.
    if (value === undefined) return { current_page: 1, per_page: Math.max(1, legacyCount), last_page: 1, total: legacyCount };
    const m = value as ListMeta;
    if (!m || ![m.current_page, m.per_page, m.last_page, m.total].every(Number.isInteger) || m.current_page < 1 || m.per_page < 1 || m.per_page > 100 || m.last_page < 1 || m.total < 0)
        throw new Error('PASS returned an incomplete results page. Refresh and try again.');
    return m;
}
export function listPath(base: string, page = 1, filters: Record<string, string | number | undefined> = {}): string {
    const values = Object.entries({ ...(page > 1 ? { page } : {}), ...filters }).filter(([, v]) => v !== undefined && String(v).trim() !== '');
    return base + (values.length ? '?' + values.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim())}`).join('&') : '');
}
