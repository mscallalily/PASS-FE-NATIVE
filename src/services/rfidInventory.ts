import { listMeta } from './listPage';
export type InventoryStatus = 'available' | 'assigned' | 'issued' | 'lost' | 'damaged' | 'revoked';
export type InventoryAssignment = {
    assignment_id: number;
    vehicle_id: number | null;
    assignment_status: string;
    assignment_source: string | null;
    assigned_at: string | null;
    issued_at: string | null;
    issued_by: string | null;
    unassigned_at: string | null;
    plate_number: string | null;
    user_code: string | null;
    user_type: string | null;
    user_name: string | null;
};
export type InventoryItem = {
    history_count?: number;
    rfid_id: number;
    tag_uid: string;
    status: InventoryStatus;
    inventory_source: 'reader' | 'manual' | null;
    inventory_registered_at: string | null;
    registered_by: string | null;
    current: InventoryAssignment | null;
    history: InventoryAssignment[];
};
export type PendingRfidVehicle = {
    vehicle_id: number;
    plate_number: string;
    owner_name: string | null;
    user_code: string;
    user_type: string;
    rfid_requested_at: string | null;
};
export type InventoryResponse = {
    meta?: import('./listPage').ListMeta;
    pending_meta?: import('./listPage').ListMeta;
    data: InventoryItem[];
    summary: Record<InventoryStatus | 'total' | 'pending_vehicles', number>;
    pending: PendingRfidVehicle[];
};
export const INVENTORY_LABELS: Record<InventoryStatus, string> = { available: 'Available', assigned: 'Assigned, not issued', issued: 'Issued', lost: 'Lost', damaged: 'Damaged', revoked: 'Revoked' };
export function normalizeInventoryUid(value: string): string { return value.trim().replace(/[\s:-]+/g, '').toUpperCase(); }
export function inventoryUidProblem(raw: string, source: 'reader' | 'manual'): string | null {
    const uid = normalizeInventoryUid(raw);
    if (source === 'reader' && !/^[A-F0-9]{24}$/.test(uid))
        return 'Present one sticker so the external reader sends its complete 24-character EPC, then Enter.';
    if (source === 'manual' && !/^[A-F0-9]{8,50}$/.test(uid))
        return 'Enter the real sticker UID: 8 to 50 hexadecimal characters (0–9, A–F).';
    return null;
}
export function expectInventory(payload: InventoryResponse): InventoryResponse {
    if (!payload || !Array.isArray(payload.data) || !Array.isArray(payload.pending) || !payload.summary || typeof payload.summary !== 'object')
        throw new Error('PASS returned incomplete RFID inventory. Refresh and try again.');
    const validAssignment = (a: InventoryAssignment) => a && Number.isInteger(a.assignment_id) && a.assignment_id > 0 && [a.plate_number, a.user_code, a.user_name].every(v => v === null || typeof v === 'string');
    if (!payload.data.every(item => item && Number.isInteger(item.rfid_id) && item.rfid_id > 0 && typeof item.tag_uid === 'string' && typeof item.status === 'string' && Array.isArray(item.history) && item.history.every(validAssignment) && (item.current === null || validAssignment(item.current))) || !payload.pending.every(row => row && Number.isInteger(row.vehicle_id) && typeof row.plate_number === 'string'))
        throw new Error('PASS returned incomplete sticker records. Refresh and try again.');
    listMeta(payload.meta, payload.data.length); listMeta(payload.pending_meta, payload.pending.length);
    return payload;
}
export function inventoryMatches(item: InventoryItem, search: string, status: string): boolean {
    const q = search.trim().toLowerCase();
    return (!status || item.status === status) && (!q || [item.tag_uid, item.current?.plate_number, item.current?.user_code, item.current?.user_name].some(v => v?.toLowerCase().includes(q)));
}
export function assignmentExpectation(item: InventoryItem): {
    expected_assignment_id: number | null;
} {
    return { expected_assignment_id: item.current?.assignment_id ?? null };
}
