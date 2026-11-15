import { archiveProblem, archiveQuery, DEFAULT_HISTORY_FILTERS, documentPath, expectArchives, expectHistory, historyProblem, historyQuery } from '../src/services/adminRecords';
import { assignmentExpectation, inventoryMatches, inventoryUidProblem, normalizeInventoryUid, type InventoryItem } from '../src/services/rfidInventory';
import { changes, valueText } from '../src/services/recordPresentation';
import { canAccessModule, modulesForRole } from '../src/permissions';
describe('administrator workspace contracts', () => {
    it('keeps inventory and retained records out of regular and security navigation', () => {
        for (const role of ['admin', 'parking_admin'] as const)
            for (const key of ['rfid-inventory', 'records'] as const)
                expect(canAccessModule(role, key)).toBe(true);
        for (const role of ['security', 'parking_staff', 'student', 'faculty', 'employee', 'guest', null] as const)
            for (const key of ['rfid-inventory', 'records'] as const) {
                expect(canAccessModule(role, key)).toBe(false);
                expect(modulesForRole(role)).not.toContain(key);
            }
    });
    it('normalizes real hexadecimal UIDs and keeps reader/manual validation separate', () => {
        expect(normalizeInventoryUid(' e280-0000:0000000000000001 ')).toBe('E28000000000000000000001');
        expect(inventoryUidProblem('E28000000000000000000001', 'reader')).toBeNull();
        expect(inventoryUidProblem('ABCD1234', 'reader')).toMatch(/24/);
        expect(inventoryUidProblem('ABCD1234', 'manual')).toBeNull();
        expect(inventoryUidProblem('NOT-A-TAG', 'manual')).toMatch(/hexadecimal/);
        expect(inventoryUidProblem('A'.repeat(51), 'manual')).toBeTruthy();
    });
    it('searches sticker ownership and sends the assignment that was actually shown', () => {
        const row = { tag_uid: 'E2801234', status: 'assigned', current: { assignment_id: 17, plate_number: 'QA1234', user_name: 'Synthetic Owner', user_code: '2026-10001' } } as InventoryItem;
        expect(inventoryMatches(row, 'owner', 'assigned')).toBe(true);
        expect(inventoryMatches(row, 'QA1234', 'lost')).toBe(false);
        expect(assignmentExpectation(row)).toEqual({ expected_assignment_id: 17 });
        expect(assignmentExpectation({ ...row, current: null })).toEqual({ expected_assignment_id: null });
    });
    it('uses server-side archive pagination and escapes search input', () => {
        expect(archiveQuery('vehicles', 'archived', 2, 'QA & 123')).toBe('/admin/record-archives/vehicles?state=archived&page=2&search=QA%20%26%20123');
        expect(historyQuery({ ...DEFAULT_HISTORY_FILTERS, record_type: 'vehicles', search: 'QA/123' }, 3)).toBe('/admin/record-history?page=3&scope=business&include_baseline=0&search=QA%2F123&record_type=vehicles');
    });
    it('validates calendar ranges and meaningful archive/restore reasons', () => {
        expect(historyProblem({ ...DEFAULT_HISTORY_FILTERS, date_from: '2028-02-29' })).toBeNull();
        expect(historyProblem({ ...DEFAULT_HISTORY_FILTERS, date_from: '2027-02-29' })).toMatch(/valid date/);
        expect(historyProblem({ ...DEFAULT_HISTORY_FILTERS, date_from: '2026-10-31', date_to: '2026-10-30' })).toMatch(/end date/);
        expect(archiveProblem('    ')).toMatch(/reason/);
        expect(archiveProblem(' valid reason ')).toBeNull();
        expect(archiveProblem('x'.repeat(501))).toBeTruthy();
    });
    it('refuses incomplete list payloads and invalid document references', () => {
        expect(() => expectArchives({ data: [{}], current_page: 1, last_page: 1, total: 1 } as any)).toThrow(/incomplete/);
        expect(() => expectHistory({ history: { data: [{}], current_page: 1, last_page: 1, total: 1 }, entities: {} } as any)).toThrow(/incomplete/);
        expect(documentPath(3, { side: 'before', field: 'license_image_path' })).toBe('/admin/record-history/3/documents/license_image_path?side=before');
        expect(() => documentPath(3, { side: 'before', field: '../private' })).toThrow(/invalid/);
    });
    it('retained changes hide secrets and document paths while preserving Philippine time', () => {
        const rows = changes({ status: 'pending', password: 'secret', nested: { api_key: 'old', name: 'Old' } }, { status: 'active', password: 'new', nested: { api_key: 'new', name: 'New' }, license_image_path: 'private/path', token_hash: 'private' });
        expect(JSON.stringify(rows)).not.toMatch(/secret|private\/path|api_key|password|token_hash/);
        expect(rows.map(r => r.key)).toEqual(['nested', 'status']);
        expect(valueText('updated_at', '2026-10-30T18:00:00Z')).toContain('PHT');
        expect(valueText('expiry_date', '2031-01-01')).toBe('2031-01-01');
    });
});
