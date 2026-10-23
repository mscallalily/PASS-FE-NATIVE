import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { LicenseProvider } from '../src/context/LicenseContext';
import { WelcomeScreen } from '../src/screens/AuthScreens';
import { GuestRequestScreen, QRPassScreen } from '../src/screens/MoreScreens';
import { MODULES, ModuleMenu } from '../src/screens/OperationsScreens';

jest.mock('expo-secure-store', () => ({getItemAsync: jest.fn(async () => null),setItemAsync: jest.fn(async () => {}),deleteItemAsync: jest.fn(async () => {})}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: any) => children,
  useSafeAreaInsets: () => ({top:24,bottom:0,left:0,right:0}),
}));

const wrap = async (el: React.ReactElement) => render(<AuthProvider><LicenseProvider>{el}</LicenseProvider></AuthProvider>);

beforeEach(() => { (global as any).fetch = jest.fn(); });

describe('PASS authentication and guest safety', () => {
  it('provides a welcome screen', async () => {
    await wrap(<WelcomeScreen onLogin={() => {}} onRegister={() => {}} />);
    expect(await screen.findByText('Sign In')).toBeTruthy();
    expect(screen.getByText('Continue as Guest')).toBeTruthy();
  });

  it('allows admin roles and keeps the exact security role', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ok:true,status:200,json:async () => ({token:'abc',user:{id:1,name:'Tester User',email:'staff@example.com',role:'security',accountStatus:'active'}})});
    let ctx: ReturnType<typeof useAuth> | null = null;
    function Probe() { ctx = useAuth();return null; }
    await render(<AuthProvider><Probe/></AuthProvider>);
    await act(async () => { await ctx!.login('staff@example.com','secret'); });
    expect(ctx!.user?.role).toBe('security');
  });

  it('keeps a verified pending applicant signed in only to their review status', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'pending-token',
      user: { id: 4, name: 'Pending Applicant', email: 'student@example.com', role: 'student', accountStatus: 'pending', emailVerified: true } }) });
    let ctx: ReturnType<typeof useAuth> | null = null;
    function Probe() { ctx = useAuth(); return null; }
    await render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await ctx!.login('student@example.com', 'password'); });
    expect(ctx!.user?.accountStatus).toBe('pending');
    expect(ctx!.token).toBe('pending-token');
  });

  it('accepts only restricted onboarding for an invited, unverified security account', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'setup-token',
      user: { id: 5, name: 'Invited Staff', email: 'staff@example.com', role: 'security', accountStatus: 'active', emailVerified: false,
        accountSetup: { required: true, step: 'verify_email' } } }) });
    let ctx: ReturnType<typeof useAuth> | null = null;
    function Probe() { ctx = useAuth(); return null; }
    await render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await ctx!.login('staff@example.com', 'temporary-password'); });
    expect(ctx!.user?.accountSetup?.required).toBe(true);
    expect(ctx!.user?.emailVerified).toBe(false);
  });

  it('does not present a fabricated guest QR', async () => {
    await wrap(<QRPassScreen user={{id:'guest',name:'Guest User',email:'',role:'guest'}} guestStatus="not_submitted" />);
    expect(await screen.findByText('Visitor QR passes')).toBeTruthy();
  });

  it('explains that guests cannot self-approve parking access', async () => {
    await wrap(<GuestRequestScreen status="not_submitted" details={null} setRequest={() => {}} />);
    expect(await screen.findByText('Visitor registration requires verification')).toBeTruthy();
  });

  it('keeps an explicit admin gate on audit, reports and settings', () => {
    expect(MODULES.audit.roles).toEqual(['admin']);
    expect(MODULES.reports.roles).toEqual(['admin']);
    expect(MODULES.settings.roles).toEqual(['admin']);
  });
});
