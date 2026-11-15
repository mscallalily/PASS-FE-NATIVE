import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { LicenseProvider, useLicense } from '../src/context/LicenseContext';
import { api } from '../src/api/client';
let mockSaved: string | null = null;
let auth: ReturnType<typeof useAuth>;
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn()
}));
const user = (id = 1) => ({
    id, name: 'Synthetic User', email: `test${id}@dyci.edu.ph`, role: 'student', accountStatus: 'active', emailVerified: true
});
const json = (data: unknown, status = 200) => ({
    ok: status < 300, status, json: async () => data
});
function Probe() {
    auth = useAuth();
    return <Text>{auth.user ? auth.user.name : 'Signed out'}</Text>;
}
beforeEach(() => {
    jest.clearAllMocks();
    mockSaved = null;
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => mockSaved);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key, value) => {
        mockSaved = value;
    });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => {
        mockSaved = null;
    });
    global.fetch = jest.fn() as any;
});
describe('recoverable saved sessions and account isolation', () => {
    it('retains an offline credential and restores it through Retry', async () => {
        mockSaved = 'saved-token';
        (fetch as jest.Mock).mockRejectedValue(new Error('offline'));
        await render(<AuthProvider><Probe /></AuthProvider>);
        expect(await screen.findByText('Unable to check your session')).toBeTruthy();
        expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
        expect(mockSaved).toBe('saved-token');
        (fetch as jest.Mock).mockResolvedValue(json({
            user: user()
        }));
        await fireEvent.press(screen.getByLabelText('Retry saved session'));
        await waitFor(() => expect(auth.user?.id).toBe('1'));
        expect(auth.token).toBe('saved-token');
    });
    it('keeps the credential on malformed success and ordinary permission failures', async () => {
        mockSaved = 'saved';
        (fetch as jest.Mock).mockResolvedValue(json({}));
        await render(<AuthProvider><Probe /></AuthProvider>);
        expect(await screen.findByText('Unable to check your session')).toBeTruthy();
        expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
        (fetch as jest.Mock).mockResolvedValue(json({
            message: 'Permission denied'
        }, 403));
        await fireEvent.press(screen.getByLabelText('Retry saved session'));
        expect(await screen.findByText('Permission denied')).toBeTruthy();
        expect(mockSaved).toBe('saved');
    });
    it.each([401, 403])('removes an authoritative invalid saved session (%i)', async (status) => {
        mockSaved = 'expired';
        (fetch as jest.Mock).mockResolvedValue(json({
            code: 'account_not_active'
        }, status));
        await render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(auth.restoring).toBe(false));
        expect(auth.user).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
        expect(mockSaved).toBeNull();
    });
    it('ignores another token’s rejection and clears a revoked current token', async () => {
        (fetch as jest.Mock).mockResolvedValue(json({
            token: 'new-token', user: user()
        }));
        await render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(auth.restoring).toBe(false));
        await act(async () => {
            await auth.login('test', 'password');
        });
        (fetch as jest.Mock).mockResolvedValue(json({
            message: 'Unauthenticated'
        }, 401));
        await act(async () => {
            await api('/me', {
                token: 'old-token'
            }).catch(() => {
            });
        });
        expect(auth.token).toBe('new-token');
        await act(async () => {
            await api('/me', {
                token: 'new-token'
            }).catch(() => {
            });
        });
        expect(auth.user).toBeNull();
        await waitFor(() => expect(mockSaved).toBeNull());
    });
    it('never resurrects an account when refresh resolves after logout', async () => {
        (fetch as jest.Mock).mockResolvedValue(json({
            token: 'token', user: user()
        }));
        await render(<AuthProvider><Probe /></AuthProvider>);
        await act(async () => {
            await auth.login('test', 'password');
        });
        let complete!: (value: unknown) => void;
        (fetch as jest.Mock).mockImplementation((url: string) => url.endsWith('/me') ? new Promise(resolve => {
            complete = resolve;
        }) : Promise.resolve(json({
            message: 'Logged out'
        })));
        let request!: Promise<void>;
        await act(async () => {
            request = auth.refreshUser();
        });
        await act(async () => {
            await auth.logout();
        });
        await act(async () => {
            complete(json({
                user: user()
            }));
            await request;
        });
        expect(auth.user).toBeNull();
        expect(auth.token).toBeNull();
        expect(mockSaved).toBeNull();
    });
    it('serializes storage so an unfinished sign-in cannot overwrite logout', async () => {
        let complete!: () => void;
        (SecureStore.setItemAsync as jest.Mock).mockImplementation((_key, value) => new Promise<void>(resolve => {
            complete = () => {
                mockSaved = value;
                resolve();
            };
        }));
        (fetch as jest.Mock).mockResolvedValue(json({
            token: 'late-token', user: user()
        }));
        await render(<AuthProvider><Probe /></AuthProvider>);
        let login!: Promise<unknown>, logout!: Promise<void>;
        await act(async () => {
            login = auth.login('test', 'password').catch(e => e);
        });
        await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
        await act(async () => {
            logout = auth.logout();
        });
        await act(async () => {
            complete();
            await Promise.all([login, logout]);
        });
        expect(auth.user).toBeNull();
        expect(mockSaved).toBeNull();
    });
    it('does not request protected license data for a pending applicant', async () => {
        mockSaved = 'pending';
        (fetch as jest.Mock).mockResolvedValue(json({
            user: {
                ...user(), accountStatus: 'pending'
            }
        }));
        await render(<AuthProvider><LicenseProvider><Probe /></LicenseProvider></AuthProvider>);
        await waitFor(() => expect(auth.user?.accountStatus).toBe('pending'));
        expect((fetch as jest.Mock).mock.calls.filter(([url]) => url.endsWith('/licenses/mine'))).toEqual([]);
        expect(auth.token).toBe('pending');
    });
    it('hides the previous account’s license while the next session loads', async () => {
        let current = user(), license: ReturnType<typeof useLicense>;
        function LicenseProbe() {
            license = useLicense();
            return <Probe />;
        }
        (fetch as jest.Mock).mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/licenses/mine') ? {
            data: {
                license_id: 5, verification_status: 'verified', license_number: 'PRIVATE-ONE'
            }
        } : {
            token: `token-${current.id}`, user: current
        })));
        await render(<AuthProvider><LicenseProvider><LicenseProbe /></LicenseProvider></AuthProvider>);
        await act(async () => {
            await auth.login('one', 'password');
        });
        await waitFor(() => expect(license!.submission?.license_number).toBe('PRIVATE-ONE'));
        current = user(2);
        (fetch as jest.Mock).mockImplementation((url: string) => url.endsWith('/licenses/mine') ? new Promise(() => {
        }) : Promise.resolve(json({
            token: 'token-2', user: current
        })));
        await act(async () => {
            await auth.login('two', 'password');
        });
        expect(license!.submission).toBeNull();
    });
});
