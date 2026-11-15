import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError } from '../src/api/client';
import RfidInventoryScreen from '../src/screens/RfidInventoryScreen';
import RecordsHistoryScreen from '../src/screens/RecordsHistoryScreen';
import { DataModuleScreen, ModuleMenu } from '../src/screens/OperationsScreens';
const mockAuth = { user: { id: '1', role: 'admin' as any }, token: 'first-token' };
const mockHandlers: Record<string, () => void> = {};
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/context/LicenseContext', () => ({ useLicense: () => ({ status: 'verified' }) }));
jest.mock('../src/api/client', () => ({ ...jest.requireActual('../src/api/client'), api: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));
jest.mock('../src/components/ui', () => ({ ...jest.requireActual('../src/components/ui'), Btn: (props: any) => {
        if (!props.disabled && !props.loading)
            mockHandlers[props.label] = props.onPress;
        return require('react').createElement(jest.requireActual('../src/components/ui').Btn, props);
    } }));
jest.mock('../src/components/PrivateDocumentPreview', () => ({ __esModule: true, default: ({ path, label }: any) => {
        const { Text } = require('react-native');
        return <Text accessibilityLabel={`Preview ${label}`}>{path}</Text>;
    } }));
const apiMock = api as jest.Mock;
const UID = 'E28000000000000000000001';
const assignment = { assignment_id: 17, vehicle_id: 8, assignment_status: 'active', assignment_source: 'inventory', assigned_at: '2026-10-30T01:00:00Z', issued_at: null, issued_by: null, unassigned_at: null, plate_number: 'QA1234', user_code: '2026-00001', user_type: 'student', user_name: 'Synthetic Owner' };
function inventory(issued = false) { return { data: [{ rfid_id: 4, tag_uid: UID, status: issued ? 'issued' : 'assigned', inventory_source: 'reader', inventory_registered_at: '2026-10-30T01:00:00Z', registered_by: 'ADMIN', current: { ...assignment, issued_at: issued ? '2026-10-30T02:00:00Z' : null }, history: [assignment] }], summary: { total: 1, available: 0, assigned: issued ? 0 : 1, issued: issued ? 1 : 0, lost: 0, damaged: 0, revoked: 0, pending_vehicles: 0 }, pending: [] }; }
function archives(path: string) {
    const q = new URLSearchParams(path.split('?')[1]), page = Number(q.get('page') || 1), archived = q.get('state') === 'archived', vehicle = path.includes('/vehicles?');
    return { data: [{ id: 10 + page, identifier: vehicle ? 'QA1234' : `2026-0000${page}`, name: vehicle ? '2020 Toyota Vios' : 'Synthetic Account', email: vehicle ? undefined : 'synthetic@dyci.edu.ph', owner: vehicle ? 'Synthetic Owner' : undefined, status: vehicle ? 'registered' : 'active', archived_at: archived ? '2026-10-30T01:00:00Z' : null }], current_page: page, last_page: 2, total: 2, summary: { active: 2, archived: 2 } };
}
const revision = { revision_id: 11, record_type: 'driver_licenses', record_type_label: 'Driver license', record_label: 'Synthetic retained license', record_id: '2', operation: 'updated', actor_label: 'ADMIN', source: 'api', recorded_at: '2026-10-30T18:00:00Z', before_values: { account_status: 'pending', password: 'DO-NOT-DISPLAY', nested: { api_key: 'HIDDEN-KEY', first_name: 'Old' } }, after_values: { account_status: 'active', password: 'DO-NOT-DISPLAY', license_image_path: 'private-id/storage.jpg', nested: { api_key: 'HIDDEN-KEY', first_name: 'New' } }, documents: [{ side: 'before', field: 'license_image_path' }] };
const history = { history: { data: [revision], current_page: 1, last_page: 1, total: 1 }, entities: { users: 'Accounts', vehicles: 'Vehicles' }, started_at: '2026-10-30T01:00:00Z' };
function get(path: string) { if (path === '/rfid/inventory')
    return inventory(); if (path.startsWith('/admin/record-archives/'))
    return archives(path); if (path.startsWith('/admin/record-history?'))
    return history; return { data: [] }; }
const calls = (method = 'POST') => apiMock.mock.calls.filter(([, options]) => options?.method === method);
function deferred<T = any>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }
beforeEach(() => { mockAuth.user = { id: '1', role: 'admin' }; mockAuth.token = 'first-token'; apiMock.mockReset(); for (const key of Object.keys(mockHandlers))
    delete mockHandlers[key]; apiMock.mockImplementation(async (path: string, options: any) => options?.method === 'POST' ? { message: 'Action saved' } : get(path)); });
describe('native administrator inventory', () => {
    it('is reachable from the admin menu and routes to the real inventory endpoint', async () => {
        const open = jest.fn();
        await render(<ModuleMenu open={open}/>);
        await fireEvent.press(screen.getByRole('button', { name: 'Open RFID Inventory' }));
        expect(open).toHaveBeenCalledWith('rfid-inventory');
        await fireEvent.press(screen.getByRole('button', { name: 'Open Records & History' }));
        expect(open).toHaveBeenCalledWith('records');
        await render(<DataModuleScreen module="rfid-inventory" back={() => { }}/>);
        await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/rfid/inventory', expect.objectContaining({ token: 'first-token', signal: expect.any(AbortSignal) })));
        expect(apiMock.mock.calls.filter(([path]) => path === '/rfid/inventory')).toHaveLength(1);
    });
    it('blocks security and regular users before requesting privileged data', async () => {
        for (const role of ['security', 'parking_staff', 'student', 'employee', 'guest']) {
            mockAuth.user = { id: '2', role };
            const view = await render(<><RfidInventoryScreen back={() => { }}/><RecordsHistoryScreen back={() => { }}/></>);
            expect(screen.getAllByText('Administrator access required')).toHaveLength(2);
            await view.unmount();
        }
        expect(apiMock).not.toHaveBeenCalled();
    });
    it('registers a real manually copied UID only after explicit review', async () => {
        await render(<RfidInventoryScreen back={() => { }}/>);
        await screen.findByText(UID);
        await fireEvent.changeText(screen.getByLabelText('Sticker UID'), 'ab-cd:1234');
        await fireEvent.press(screen.getByRole('button', { name: 'Review sticker' }));
        expect(calls()).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Register sticker' })).toBeDisabled();
        await fireEvent.press(screen.getByRole('checkbox', { name: 'I copied this UID from a real sticker' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Register sticker' }));
        await waitFor(() => expect(calls()).toHaveLength(1));
        expect(calls()[0]).toEqual(['/rfid/inventory', expect.objectContaining({ method: 'POST', json: { tag_uid: 'ABCD1234', source: 'manual' }, token: 'first-token' })]);
    });
    it('rejects incomplete reader frames without fabricating a sticker', async () => {
        await render(<RfidInventoryScreen back={() => { }}/>);
        await screen.findByText(UID);
        await fireEvent.press(screen.getByRole('tab', { name: 'External reader' }));
        await fireEvent.changeText(screen.getByLabelText('Sticker UID'), 'E2801234');
        await fireEvent.press(screen.getByRole('button', { name: 'Review sticker' }));
        expect(screen.getByText(/complete 24-character/)).toBeTruthy();
        expect(calls()).toHaveLength(0);
    });
    it('submits one hand-over on two same-frame taps and uses the shown assignment', async () => {
        const done = deferred();
        let issued = false;
        apiMock.mockImplementation((path: string, options: any) => options?.method === 'POST' ? done.promise : Promise.resolve(path === '/rfid/inventory' ? inventory(issued) : get(path)));
        await render(<RfidInventoryScreen back={() => { }}/>);
        await screen.findByText(UID);
        await fireEvent.press(screen.getByRole('button', { name: `Confirm hand-over ${UID}` }));
        const enabled = mockHandlers['Confirm hand-over'];
        expect(enabled).toBeDefined();
        try {
            await act(async () => { enabled(); enabled(); await Promise.resolve(); });
            expect(calls()).toHaveLength(1);
            expect(calls()[0]).toEqual(['/rfid/inventory/4/issue', expect.objectContaining({ json: { expected_assignment_id: 17 } })]);
            expect(screen.getByRole('button', { name: 'Confirm hand-over' })).toBeDisabled();
        }
        finally {
            issued = true;
            await act(async () => done.resolve({ message: 'Hand-over recorded' }));
        }
        await screen.findByText('Hand-over recorded');
        await waitFor(() => expect(screen.queryByRole('button', { name: `Confirm hand-over ${UID}` })).toBeNull());
    });
    it('allows an explicit replacement request and retains failed confirmation for safe reload', async () => {
        apiMock.mockImplementation(async (path: string, options: any) => { if (options?.method === 'POST')
            throw new ApiError('This sticker assignment changed. Refresh the inventory.', 409); return get(path); });
        await render(<RfidInventoryScreen back={() => { }}/>);
        await screen.findByText(UID);
        await fireEvent.press(screen.getByRole('button', { name: `Mark lost ${UID}` }));
        await fireEvent.press(screen.getByRole('checkbox', { name: 'Request a replacement sticker for this vehicle' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Confirm lost' }));
        await screen.findByRole('button', { name: 'Reload current inventory' });
        expect(calls()[0]).toEqual(['/rfid/inventory/4/retire', expect.objectContaining({ json: { status: 'lost', replace: true, expected_assignment_id: 17 } })]);
        await fireEvent.press(screen.getByRole('button', { name: 'Reload current inventory' }));
        await waitFor(() => expect(apiMock.mock.calls.filter(([p]) => p === '/rfid/inventory')).toHaveLength(2));
        expect(calls()).toHaveLength(1);
    });
    it('does not show an old administrator response after an account switch', async () => {
        const old = deferred();
        apiMock.mockImplementation((path: string, options: any) => options?.token === 'first-token' ? old.promise : Promise.resolve({ ...inventory(), data: [] }));
        const view = await render(<RfidInventoryScreen back={() => { }}/>);
        mockAuth.user = { id: '3', role: 'parking_admin' };
        mockAuth.token = 'second-token';
        await view.rerender(<RfidInventoryScreen back={() => { }}/>);
        await act(async () => old.resolve(inventory()));
        await screen.findByText('No physical stickers registered yet.');
        expect(screen.queryByText(UID)).toBeNull();
        expect(apiMock.mock.calls[0][1].signal.aborted).toBe(true);
    });
    it('ignores a late mutation result after switching administrators', async () => {
        const done = deferred();
        apiMock.mockImplementation((path: string, options: any) => options?.method === 'POST' ? done.promise : Promise.resolve(options?.token === 'first-token' ? inventory() : { ...inventory(), data: [] }));
        const view = await render(<RfidInventoryScreen back={() => { }}/>);
        await screen.findByText(UID);
        await fireEvent.press(screen.getByRole('button', { name: `Confirm hand-over ${UID}` }));
        await fireEvent.press(screen.getByRole('button', { name: 'Confirm hand-over' }));
        try {
            mockAuth.user = { id: '3', role: 'parking_admin' };
            mockAuth.token = 'second-token';
            await view.rerender(<RfidInventoryScreen back={() => { }}/>);
            await screen.findByText('No physical stickers registered yet.');
        }
        finally {
            await act(async () => done.resolve({ message: 'Old administrator result' }));
        }
        expect(screen.queryByText('Old administrator result')).toBeNull();
        expect(calls()).toHaveLength(1);
        expect(calls()[0][1].signal.aborted).toBe(true);
    });
});
describe('native administrator records', () => {
    it('uses server pagination and sends the web-supported archive search filters', async () => {
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('2026-00001');
        await fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
        await screen.findByText('2026-00002');
        await fireEvent.changeText(screen.getByLabelText('Search records'), 'QA & 123');
        await fireEvent.press(screen.getByRole('button', { name: 'Apply record filters' }));
        await waitFor(() => expect(apiMock.mock.calls.some(([p]) => p === '/admin/record-archives/users?state=active&page=1&search=QA%20%26%20123')).toBe(true));
    });
    it('does not overwrite a new search with an older slow response', async () => {
        const old = deferred();
        apiMock.mockImplementationOnce(() => old.promise).mockImplementation(async () => ({ ...archives('/admin/record-archives/users?page=1'), data: [{ id: 22, identifier: 'NEW-RESULT', name: 'New search result', status: 'active', archived_at: null }] }));
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await fireEvent.changeText(screen.getByLabelText('Search records'), 'New search');
        await fireEvent.press(screen.getByRole('button', { name: 'Apply record filters' }));
        await screen.findByText('NEW-RESULT');
        await act(async () => old.resolve(archives('/admin/record-archives/users?page=1')));
        expect(screen.queryByText('2026-00001')).toBeNull();
        expect(screen.getByText('NEW-RESULT')).toBeTruthy();
    });
    it('requires a reason and explicit confirmation before archiving', async () => {
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('2026-00001');
        await fireEvent.press(screen.getByRole('button', { name: 'Archive 2026-00001' }));
        expect(screen.getByRole('button', { name: 'Archive record' })).toBeDisabled();
        await fireEvent.changeText(screen.getByLabelText('Archive or restore reason'), '  Duplicate test record  ');
        await fireEvent.press(screen.getByRole('button', { name: 'Archive record' }));
        await screen.findByText('Action saved');
        expect(calls()[0]).toEqual(['/admin/record-archives/users/11/archive', expect.objectContaining({ json: { reason: 'Duplicate test record' } })]);
    });
    it('does not offer archiving the signed-in administrator account', async () => {
        apiMock.mockImplementation(async () => ({ ...archives('/admin/record-archives/users?page=1'), data: [{ id: 1, identifier: 'MY-ADMIN', name: 'Current administrator', status: 'active', archived_at: null }] }));
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('MY-ADMIN');
        expect(screen.getByRole('button', { name: 'Archive MY-ADMIN' })).toBeDisabled();
        expect(screen.getByText('You cannot archive your own administrator account.')).toBeTruthy();
        expect(calls()).toHaveLength(0);
    });
    it('retains the restore reason after a server conflict and never retries automatically', async () => {
        apiMock.mockImplementation(async (path: string, options: any) => { if (options?.method === 'POST')
            throw new ApiError('Identifier conflict. Refresh the records.', 409); return get(path); });
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('2026-00001');
        await fireEvent.press(screen.getByRole('tab', { name: /^Archived/ }));
        await screen.findByRole('button', { name: 'Restore 2026-00001' });
        await fireEvent.press(screen.getByRole('button', { name: 'Restore 2026-00001' }));
        await fireEvent.changeText(screen.getByLabelText('Archive or restore reason'), 'Restore for review');
        await fireEvent.press(screen.getByRole('button', { name: 'Restore record' }));
        await screen.findByText('Identifier conflict. Refresh the records.');
        expect(screen.getByLabelText('Archive or restore reason').props.value).toBe('Restore for review');
        expect(calls()).toHaveLength(1);
        expect(calls()[0][0]).toBe('/admin/record-archives/users/11/restore');
    });
    it('shows field changes and protected document references without raw secrets', async () => {
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('2026-00001');
        await fireEvent.press(screen.getByRole('tab', { name: 'Change history' }));
        await screen.findByText('Synthetic retained license');
        await fireEvent.press(screen.getByRole('button', { name: 'View change 11' }));
        await screen.findByText('What changed');
        expect(screen.queryByText(/DO-NOT-DISPLAY|HIDDEN-KEY|private-id\/storage/)).toBeNull();
        expect(screen.getByText('/admin/record-history/11/documents/license_image_path?side=before')).toBeTruthy();
        expect(screen.getAllByText(/PHT/).length).toBeGreaterThan(0);
        expect(screen.getByRole('checkbox', { name: 'Include unchanged fields' })).toBeTruthy();
    });
    it('does not request history with an invalid date range', async () => {
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('2026-00001');
        await fireEvent.press(screen.getByRole('tab', { name: 'Change history' }));
        await screen.findByText('Synthetic retained license');
        await fireEvent.press(screen.getByRole('button', { name: 'More history filters' }));
        const before = apiMock.mock.calls.length;
        await fireEvent.changeText(screen.getByLabelText('History from date'), '2027-02-29');
        await fireEvent.press(screen.getByRole('button', { name: 'Apply record filters' }));
        expect(screen.getByText(/valid date in YYYY-MM-DD/)).toBeTruthy();
        expect(apiMock).toHaveBeenCalledTimes(before);
    });
    it('provides a retry after a failed read without rendering incomplete records', async () => {
        apiMock.mockRejectedValueOnce(new Error('Network unavailable'));
        await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('Network unavailable');
        await fireEvent.press(screen.getByRole('button', { name: 'Retry loading' }));
        await screen.findByText('2026-00001');
        expect(calls()).toHaveLength(0);
    });
    it('closes retained record details immediately when the account loses access', async () => {
        const view = await render(<RecordsHistoryScreen back={() => { }}/>);
        await screen.findByText('2026-00001');
        await fireEvent.press(screen.getByRole('tab', { name: 'Change history' }));
        await screen.findByText('Synthetic retained license');
        await fireEvent.press(screen.getByRole('button', { name: 'View change 11' }));
        mockAuth.user = { id: '2', role: 'student' };
        mockAuth.token = 'student-token';
        const count = apiMock.mock.calls.length;
        await view.rerender(<RecordsHistoryScreen back={() => { }}/>);
        expect(screen.getByText('Administrator access required')).toBeTruthy();
        expect(screen.queryByText('Synthetic retained license')).toBeNull();
        expect(apiMock).toHaveBeenCalledTimes(count);
    });
});
