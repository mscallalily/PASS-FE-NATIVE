import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api } from '../src/api/client';
import RfidInventoryScreen from '../src/screens/RfidInventoryScreen';
import VehicleRegistrationScreen from '../src/screens/VehicleRegistrationScreen';
import RfidWorkspaceScreen from '../src/screens/RfidWorkspaceScreen';
import { DataModuleScreen } from '../src/screens/OperationsScreens';
import { listMeta, listPath } from '../src/services/listPage';

const mockAuth = { user: { id: '1', role: 'admin' as any }, token: 'page-test-token' };
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/context/LicenseContext', () => ({ useLicense: () => ({ status: 'verified', submission: { expiry_date: '2031-01-01' } }) }));
jest.mock('../src/api/client', () => ({ ...jest.requireActual('../src/api/client'), api: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));
jest.mock('../src/components/PrivateDocumentPreview', () => () => null);
const apiMock = api as jest.Mock;
const meta = (page: number, total = 21) => ({ current_page: page, per_page: 20, last_page: Math.max(1, Math.ceil(total / 20)), total });
const assignment = (id: number) => ({ assignment_id: id, vehicle_id: 5, assignment_status: 'revoked', assignment_source: 'inventory', assigned_at: null, issued_at: null, unassigned_at: null, issued_by: null, plate_number: `QA${id}`, user_code: 'QA-OWNER', user_type: 'student', user_name: 'Synthetic Owner' });
function inventory(page: number, search: string | null = null, pendingPage = 1) {
    return { data: search ? [] : [{ rfid_id: page, tag_uid: `E280${String(page).padStart(20, '0')}`, status: 'available', inventory_source: 'manual', inventory_registered_at: null, registered_by: null, current: null, history: [], history_count: 21 }],
        meta: meta(search ? 1 : page, search ? 0 : 21), pending: [], pending_meta: meta(pendingPage, 0),
        summary: { available: 21, assigned: 0, issued: 0, lost: 0, damaged: 0, revoked: 0, total: 21, pending_vehicles: 0 } };
}
beforeEach(() => {
    mockAuth.user = { id: '1', role: 'admin' }; mockAuth.token = 'page-test-token'; apiMock.mockReset();
    apiMock.mockImplementation(async (path: string) => {
        const q = new URLSearchParams(path.split('?')[1]), page = Number(q.get('page') || 1);
        if (path.startsWith('/rfid/inventory/') && path.includes('/history')) return { data: [assignment(page)], meta: meta(page) };
        if (path.startsWith('/rfid/inventory')) return inventory(page, q.get('search'));
        if (path.startsWith('/rfid/assignments')) return { data: [{ rfid_id: page, tag_uid: `QA-CREDENTIAL-${page}`, tag_type: 'sticker', tag_status: 'available', assignment_id: null, assignment_status: null }], meta: meta(page) };
        if (path.startsWith('/vehicles/authorizations')) return { data: [{ authorization_id: page, vehicle_id: page, plate_number: `QAP${page}`, authorization_status: 'approved' }], meta: meta(page) };
        if (path.startsWith('/vehicles')) return { vehicles: [{ id: String(page), plate: `QAV${page}`, status: 'approved', registrationStatus: 'registered' }], meta: meta(page), selected_vehicle: { plate_number: 'QA-SELECTED-OFF-PAGE' } };
        return { data: [] };
    });
});
it('requests the next inventory page and searches the server after returning to page one', async () => {
    await render(<RfidInventoryScreen back={() => { }}/>);
    await screen.findByText('E28000000000000000000001');
    const firstSignal = apiMock.mock.calls[0][1].signal;
    await fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('E28000000000000000000002');
    expect(firstSignal.aborted).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Search inventory'), 'ABC & 123');
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/rfid/inventory?search=ABC%20%26%20123', expect.anything()));
    expect(await screen.findByText('No stickers match these filters.')).toBeTruthy();
    expect(screen.queryByText('E28000000000000000000002')).toBeNull();
});
it('loads retained RFID assignments only when history is opened and pages that endpoint separately', async () => {
    await render(<RfidInventoryScreen back={() => { }}/>);
    await screen.findByText('E28000000000000000000001');
    expect(apiMock.mock.calls.filter(([p]) => p.includes('/history'))).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Assignment history E28000000000000000000001' }));
    expect(await screen.findByText('QA1 · Synthetic Owner')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next assignments page' }));
    expect(await screen.findByText('QA2 · Synthetic Owner')).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith('/rfid/inventory/1/history?page=2', expect.anything());
});
it('preserves a staff search while paging authorizations and queries the whole dataset', async () => {
    await render(<DataModuleScreen module="authorizations" back={() => { }}/>);
    await screen.findAllByText('QAP1');
    await fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
    await screen.findAllByText('QAP2');
    await fireEvent.changeText(screen.getByPlaceholderText('Search by plate or sticker...'), 'QA-OUTSIDE-FIRST-PAGE');
    await fireEvent.press(screen.getByRole('button', { name: 'Search all vehicle records' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/vehicles/authorizations?search=QA-OUTSIDE-FIRST-PAGE', expect.anything()));
    expect(screen.getByPlaceholderText('Search by plate or sticker...').props.value).toBe('QA-OUTSIDE-FIRST-PAGE');
});
it('keeps the selected vehicle visible when the owner navigates to another page', async () => {
    mockAuth.user.role = 'student';
    await render(<VehicleRegistrationScreen/>);
    await screen.findByText('QAV1');
    expect(screen.getByText('Selected for use: QA-SELECTED-OFF-PAGE')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('QAV2');
    expect(screen.getByText('Selected for use: QA-SELECTED-OFF-PAGE')).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith('/vehicles?page=2', expect.anything());
});
it('ignores a delayed inventory response after a newer page is visible', async () => {
    let finish!: (value: unknown) => void;
    const delayed = new Promise(resolve => { finish = resolve; });
    apiMock.mockImplementationOnce(() => delayed);
    const view = await render(<RfidInventoryScreen back={() => { }}/>);
    try {
        await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
        await fireEvent.changeText(screen.getByLabelText('Search inventory'), 'new query');
        await screen.findByText('No stickers match these filters.');
        await act(async () => finish(inventory(1)));
        expect(screen.queryByText('E28000000000000000000001')).toBeNull();
    } finally { await act(async () => finish(inventory(1))); await view.unmount(); }
});
it('encodes search values and rejects malformed page metadata', () => {
    expect(listPath('/vehicles', 2, { search: 'ABC&status=approved', type: 'SUV' })).toBe('/vehicles?page=2&search=ABC%26status%3Dapproved&type=SUV');
    expect(listMeta(meta(2))).toEqual(meta(2));
    for (const bad of [{ ...meta(1), per_page: 1000 }, { ...meta(1), current_page: 0 }, { ...meta(1), total: -1 }, { ...meta(1), last_page: '2' }]) expect(() => listMeta(bad)).toThrow(/incomplete/);
});
it('pages RFID credentials on the server and resets their page when searching', async () => {
    await render(<RfidWorkspaceScreen back={() => { }} initialTab="credentials"/>);
    await screen.findByText('QA-CREDENTIAL-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('QA-CREDENTIAL-2');
    await fireEvent.changeText(screen.getByPlaceholderText('Search tag, registered user or plate'), 'OUTSIDE FIRST');
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/rfid/assignments?search=OUTSIDE%20FIRST', expect.anything()));
    expect(apiMock).toHaveBeenCalledWith('/rfid/assignments?page=2', expect.anything());
});
it('does not expose a previous administrators delayed vehicle list after the account changes', async () => {
    let finish!: (value: unknown) => void; const delayed = new Promise(resolve => { finish = resolve; });
    apiMock.mockImplementation((path: string, options: any) => options.token === 'page-test-token' ? delayed : Promise.resolve({ data: [{ authorization_id: 2, plate_number: 'NEW-ACCOUNT-ONLY', authorization_status: 'approved' }], meta: meta(1, 1) }));
    const view = await render(<DataModuleScreen module="authorizations" back={() => { }}/>);
    try {
        await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
        mockAuth.user = { id: '2', role: 'admin' }; mockAuth.token = 'new-account-token';
        await view.rerender(<DataModuleScreen module="authorizations" back={() => { }}/>);
        await screen.findAllByText('NEW-ACCOUNT-ONLY');
        await act(async () => finish({ data: [{ authorization_id: 1, plate_number: 'PREVIOUS-ACCOUNT-PRIVATE' }], meta: meta(1, 1) }));
        expect(screen.queryByText('PREVIOUS-ACCOUNT-PRIVATE')).toBeNull();
    } finally { await act(async () => finish({ data: [], meta: meta(1, 0) })); await view.unmount(); }
});
