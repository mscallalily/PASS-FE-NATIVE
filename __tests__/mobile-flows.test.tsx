import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError } from '../src/api/client';
import VehicleRegistrationScreen from '../src/screens/VehicleRegistrationScreen';
import VisitorManagementScreen from '../src/screens/VisitorManagementScreen';
import { AdminDashboardScreen, DataModuleScreen } from '../src/screens/OperationsScreens';
const NativeFormData = require('react-native/Libraries/Network/FormData').default;
const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
const mockAccount = {
    user: {
        id: '1', role: 'student' as any
    }, token: 'test-token'
};
const mockRegisterButton = { onPress: null as (() => void) | null };
jest.mock('../src/context/AuthContext', () => ({
    useAuth: () => mockAccount
}));
jest.mock('../src/context/LicenseContext', () => ({
    useLicense: () => ({
        status: 'verified', submission: {
            expiry_date: '2031-01-01'
        }
    })
}));
jest.mock('../src/api/client', () => ({
    ...jest.requireActual('../src/api/client'), api: jest.fn()
}));
jest.mock('expo-file-system', () => ({
    File: function (this: any, uri: string) {
        this.name = uri.split('/').pop();
        this.type = 'image/png';
        this.bytes = async () => new Uint8Array([137, 80, 78, 71]);
    }
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-camera', () => ({
    CameraView: () => null, useCameraPermissions: () => [{
            granted: false
        }, jest.fn()]
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({
        top: 0, left: 0, right: 0, bottom: 0
    })
}));
// These tests start after photo selection. Native multipart encoding is exercised separately.
jest.mock('../src/components/ui', () => ({
    ...jest.requireActual('../src/components/ui'),
    Btn: (props: any) => {
        if (props.label === 'Register vehicle') mockRegisterButton.onPress = props.onPress;
        return require('react').createElement(jest.requireActual('../src/components/ui').Btn, props);
    },
    FileUpload: ({ label, file, disabled, onChange }: any) => {
        const { Pressable, Text } = require('react-native');
        return <Pressable accessibilityRole="button" accessibilityLabel={`${file ? 'Remove' : 'Upload'} ${label}`} disabled={disabled} onPress={() => onChange(file ? null : {
            uri: 'file:///cache/card.png', name: 'card.png', type: 'image/png', size: 4
        })}><Text>{file ? `${label} selected` : `Pick ${label}`}</Text></Pressable>;
    }
}));
jest.mock('../src/components/PrivateDocumentPreview', () => ({
    __esModule: true, default: ({ label, onInspected }: any) => {
        const { Pressable, Text } = require('react-native');
        return <Pressable accessibilityLabel={`Load ${label}`} onPress={() => onInspected?.(true)}><Text>Private evidence: {label}</Text></Pressable>;
    }
}));
const previous = global.FormData;
beforeAll(() => {
    global.FormData = installFormDataPatch(NativeFormData);
});
afterAll(() => {
    global.FormData = previous;
});
const fields = {
    plate_number: 'ABC1234', make: 'TOYOTA', model: 'VIOS', color: 'WHITE', year_model: '2020', vehicle_type: 'Sedan'
};
const row = {
    request_id: 8, request_status: 'pending', purpose: 'Meeting', valid_from: '2030-05-02T01:00:00Z', valid_until: '2030-05-02T03:00:00Z', window_ended: false, visitor: {
        name: 'Synthetic Visitor', contact_number: '09123456789', is_blacklisted: false
    }, vehicle: {
        plate_number: 'QA1234', vehicle_type: 'Sedan', area_name: 'Car'
    }, driver: {
        name: 'Test Driver', license_reference: '***3456', license_expiry: '2031-01-01', passenger_count: 0
    }, documents: {
        license_available: true, vehicle_available: true
    }
};
beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterButton.onPress = null;
    mockAccount.user.role = 'student';
    jest.spyOn(Alert, 'alert').mockImplementation(() => {
    });
    (api as jest.Mock).mockImplementation(async (path, options) => {
        if (path === '/vehicles' && options.method !== 'POST')
            return {
                vehicles: []
            };
        if (path === '/documents/autofill')
            return {
                status: 'ok', fields, flags: {}
            };
        if (path === '/visitors/requests' && options.method !== 'POST')
            return {
                data: [row]
            };
        if (path === '/visitors/options')
            return {
                visitors: [], vehicle_types: [{
                        vehicle_type_id: 1, type_name: 'Sedan', area_name: 'Car'
                    }], max_visit_days: 7
            };
        if (path === '/admin/dashboard')
            return {
                summary: {
                    total_users: 1
                }
            };
        if (path === '/vehicles/authorizations')
            return {
                data: [{
                        authorization_id: 3, authorization_status: 'pending', plate_number: 'ABC1234'
                    }]
            };
        return {
            message: 'Saved', vehicle_id: 42
        };
    });
});
afterEach(() => {
    jest.restoreAllMocks();
});
async function fillVehicle() {
    await fireEvent.press(await screen.findByText('Register a vehicle'));
    await fireEvent.press(screen.getByLabelText('Upload Official Receipt (OR)'));
    await fireEvent.press(screen.getByLabelText('Upload Certificate of Registration (CR)'));
    await screen.findByText('OR/CR Match Successful');
}
describe('vehicle registration and correction', () => {
    it('sends both autofilled documents once on two quick submit taps', async () => {
        await render(<VehicleRegistrationScreen />);
        await fillVehicle();
        let done!: (value: any) => void;
        const response = new Promise(resolve => { done = resolve; });
        (api as jest.Mock).mockImplementation((path, options) => path === '/vehicles' && options.method === 'POST' ? response : Promise.resolve({
            vehicles: []
        }));
        expect(screen.getByRole('button', { name: 'Register vehicle' })).toBeEnabled();
        // Invoke the enabled button's public callback twice in one React batch.
        // Awaiting two presses separately only tests the already-disabled button.
        const submit = mockRegisterButton.onPress!;
        try {
            await act(async () => {
                submit();
                submit();
            });
            const requests = (api as jest.Mock).mock.calls.filter(([p, o]) => p === '/vehicles' && o.method === 'POST');
            expect(requests).toHaveLength(1);
            expect(screen.getByRole('button', { name: 'Register vehicle' })).toBeDisabled();
            const body = requests[0][1].form;
            expect(body.get('or_document').name).toBe('card.png');
            expect(body.get('cr_document').name).toBe('card.png');
            expect(body.get('plate_number')).toBe('ABC1234');
        } finally {
            // Always settle the shared request, including when an assertion fails.
            await act(async () => {
                done({ message: 'Approved by server check', vehicle_id: 42 });
                await response;
            });
        }
        expect(await screen.findByText('Approved by server check')).toBeTruthy();
        expect(screen.queryByText('Register with your OR and CR')).toBeNull();
    // Cold native UI setup can exceed five seconds on a slower Windows machine.
    // This bounded test budget does not change any application request timeout.
    }, 15000);
    it('retains selected documents and details on server rejection', async () => {
        await render(<VehicleRegistrationScreen />);
        await fillVehicle();
        (api as jest.Mock).mockRejectedValueOnce(new ApiError('OR does not match CR. No vehicle saved.', 422));
        await fireEvent.press(screen.getByText('Register vehicle'));
        expect(await screen.findByText('OR does not match CR. No vehicle saved.')).toBeTruthy();
        expect(screen.getByLabelText('Remove Official Receipt (OR)')).toBeTruthy();
        expect(screen.getByDisplayValue('ABC1234')).toBeTruthy();
    });
    it('sends corrections to the original vehicle’s resubmission endpoint', async () => {
        (api as jest.Mock).mockImplementation(async (path) => path === '/documents/autofill' ? {
            status: 'ok', fields, flags: {}
        } : path === '/vehicles/9/resubmit' ? {
            vehicle_id: 9, message: 'Corrected'
        } : {
            vehicles: [{
                    id: '9', plate: 'ABC1234', status: 'rejected', canResubmit: true
                }]
        });
        await render(<VehicleRegistrationScreen />);
        await fireEvent.press(await screen.findByText('Correct and resubmit OR/CR'));
        await fireEvent.press(screen.getByLabelText('Upload Official Receipt (OR)'));
        await fireEvent.press(screen.getByLabelText('Upload Certificate of Registration (CR)'));
        await screen.findByText('OR/CR Match Successful');
        await fireEvent.press(screen.getByText('Submit corrected OR/CR'));
        await waitFor(() => expect(api).toHaveBeenCalledWith('/vehicles/9/resubmit', expect.objectContaining({
            method: 'POST', form: expect.anything()
        })));
    });
});
describe('administrator and staff evidence actions', () => {
    it.each(['admin', 'parking_admin'])('opens the administrator workspace for %s', async (role) => {
        mockAccount.user.role = role;
        await render(<AdminDashboardScreen open={() => {
        }}/>);
        expect(await screen.findByText('Administrator tools')).toBeTruthy();
        expect(screen.getByLabelText('Open Visitor Requests')).toBeTruthy();
        expect(screen.queryByText('Access denied')).toBeNull();
    });
    it('lets security file visits without administrator decision controls', async () => {
        mockAccount.user.role = 'security';
        await render(<DataModuleScreen module="visitors" back={() => {
        }}/>);
        await fireEvent.press(await screen.findByText('Register a visitor'));
        expect(screen.getByLabelText('Actual driver’s full name')).toBeTruthy();
        expect(screen.getByLabelText('Upload Actual driver’s license photo')).toBeTruthy();
        expect(screen.getByLabelText('Upload Vehicle and visible plate photo')).toBeTruthy();
        await fireEvent.press(screen.getByText('Inspect request #8'));
        expect(screen.queryByText('Approve visitor')).toBeNull();
    });
    it('requires both loaded photos and explicit review before visitor approval', async () => {
        mockAccount.user.role = 'admin';
        await render(<VisitorManagementScreen back={() => {
        }}/>);
        await fireEvent.press(await screen.findByText('Inspect request #8'));
        expect(screen.getByText('Approve visitor')).toBeDisabled();
        await fireEvent.press(screen.getByLabelText('Load actual driver’s license'));
        expect(screen.getByText('Approve visitor')).toBeDisabled();
        await fireEvent.press(screen.getByLabelText('Load vehicle and visible plate'));
        expect(screen.getByText('Approve visitor')).toBeDisabled();
        await fireEvent.press(screen.getByLabelText('I reviewed both visitor photos'));
        expect(screen.getByText('Approve visitor')).toBeEnabled();
        await fireEvent.press(screen.getByText('Approve visitor'));
        const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2];
        await act(async () => {
            await buttons.find((b: any) => b.text === 'Confirm').onPress();
        });
        await waitFor(() => expect(api).toHaveBeenCalledWith('/visitors/requests/8/approve', expect.objectContaining({
            method: 'POST', json: {
                remarks: null, documents_reviewed: true
            }
        })));
    });
    it('removes obsolete manual campus-vehicle decisions', async () => {
        mockAccount.user.role = 'admin';
        await render(<DataModuleScreen module="authorizations" back={() => {
        }}/>);
        expect(await screen.findByText(/Vehicle decisions use the automatic OR\/CR check/)).toBeTruthy();
        expect(screen.queryByText('Approve vehicle authorization')).toBeNull();
        expect(screen.queryByText('Reject vehicle authorization')).toBeNull();
    });
    it('blocks a regular user from visitor-management data', async () => {
        await render(<DataModuleScreen module="visitors" back={() => {
        }}/>);
        expect(await screen.findByText('Access denied')).toBeTruthy();
        expect(api).not.toHaveBeenCalled();
    });
});
