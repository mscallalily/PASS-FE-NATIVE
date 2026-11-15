import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EmailCodeVerification from '../src/components/EmailCodeVerification';
import RegistrationForm, { REGISTRATION_STEPS } from '../src/components/RegistrationForm';
import { api, ApiError } from '../src/api/client';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///synthetic-license.jpg', mimeType: 'image/jpeg', fileName: 'license.jpg', fileSize: 1000 }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('react-native-qrcode-svg', () => () => null);
jest.mock('../src/api/upload', () => ({ toUploadFile: () => new (require('buffer').Blob)(['synthetic'], { type: 'image/jpeg' }) }));
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
beforeEach(() => { (global as any).fetch = jest.fn(); });

describe('ID autofill, email and read-only license registration', () => {
  it('keeps office aliases out of the college picker while retaining a real college', async () => {
    const departments = ['Engineering', 'security  office', ' HR Department ', 'IT\tDepartment', 'Registrar\u00A0Office'].map((name, i) => ({ department_id: i + 1, department_code: 'QA' + i, department_name: name }));
    (global.fetch as jest.Mock).mockImplementation((url: string) => Promise.resolve(response(url.endsWith('/departments') ? { data: departments } : {
      data: { status: 'passed', message: 'ID read.', fields: { first_name: 'MARIA ELENA', last_name: 'DELA CRUZ', middle_initial: 'S.', suffix: '', user_code: '2026-01234' }, profile_fields: {}, receipt: 'signed-receipt' },
    })));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await fireEvent.press(screen.getByText('Take ID photo'));
    await waitFor(() => expect(screen.getByText('MARIA ELENA')).toBeTruthy());
    await fireEvent.press(screen.getByText('Select'));
    expect(screen.getByText('Engineering')).toBeTruthy();
    for (const department of departments.slice(1)) expect(screen.queryByText(department.department_name)).toBeNull();
  });
  it('uses the same ID-first four steps as the website', () => {
    expect(REGISTRATION_STEPS).toEqual(['Institutional ID', 'Verify email', 'Driver’s license', 'Review & create']);
  });
  it('requires an exact institutional email before starting any registration request', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ data: [] }));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText('Institutional email'), 'someone@gmail.com');
    await fireEvent.press(screen.getByText('Send verification code'));
    expect(screen.getByText('Send verification code')).toBeDisabled();
    expect(screen.queryByLabelText('First name')).toBeNull();
    expect(screen.queryByLabelText('Birth date')).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls.filter(c => c[0].includes('/registration/sessions'))).toHaveLength(0);
  });
  it('requires a new ID photo when the institutional reader is uncertain', async () => {
    (global.fetch as jest.Mock).mockImplementation((url:string) => Promise.resolve(response(url.endsWith('/departments') ? { data: [] } : { data: { status: 'retake', message: 'Take a clearer photo.', fields: {}, profile_fields: {}, receipt: null } })));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText('Institutional email'),'maria@dyci.edu.ph');
    await fireEvent.press(screen.getByText('Take ID photo'));
    await waitFor(() => expect(screen.getByText('Retake your ID photo')).toBeTruthy());
    expect(screen.getByText('Send verification code')).toBeDisabled();
    expect(screen.queryByLabelText('First name')).toBeNull();
    expect(screen.queryByLabelText('Your contact number')).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls.some(c => c[0].endsWith('/registration/sessions'))).toBe(false);
  });
  it('shows a readable connection error if departments cannot load', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ message: 'Not found' }, 404));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Departments could not be loaded/)).toBeTruthy());
  });
  it('automatically checks a captured photo and submits only the server session and password', async () => {
    const status = { email_verified: false, completed: false, expires_at: '2030-01-01T00:00:00Z', license_processing: false, license: null };
    const license = { status: 'passed', message: 'License checks passed.', fields: { full_name: 'DELA CRUZ, MARIA ELENA SANTOS', birth_date: '2000-04-18', expiry_date: '2030-04-18', license_number: 'N01-23-456789' }, reasons: [] };
    (global.fetch as jest.Mock).mockImplementation((url: string) => Promise.resolve(response(
      url.endsWith('/departments') ? { data: [{ department_id: 1, department_code: 'COE', department_name: 'Engineering' }] } :
      url.endsWith('/registration/institutional-id') ? { data: { status: 'passed', message: 'ID read.', fields: { first_name: 'MARIA ELENA', last_name: 'DELA CRUZ', middle_initial: 'S.', suffix: '', user_code: '2026-01234' }, profile_fields: {}, receipt: 'signed-receipt' } } :
      url.endsWith('/registration/sessions') ? { session_id: 'synthetic-session', owner_key: 'owner-secret', data: status, message: 'Code sent.' } :
      url.endsWith('/verify') ? { data: { ...status, email_verified: true }, message: 'Email verified.' } :
      url.endsWith('/license') ? { data: { ...status, email_verified: true, license } } :
      { message: 'Account active.' },
    )));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText('Institutional email'),'maria@dyci.edu.ph');
    expect(screen.queryByLabelText('First name')).toBeNull();
    expect(screen.queryByLabelText('Birth date')).toBeNull();
    await fireEvent.press(screen.getByText('Take ID photo'));
    await waitFor(() => expect(screen.getByText('MARIA ELENA')).toBeTruthy());
    expect(screen.queryByDisplayValue('MARIA ELENA')).toBeNull();
    expect(screen.queryByDisplayValue('2026-01234')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Your contact number'),'09123456789');
    await fireEvent.press(screen.getByText('Select'));
    await fireEvent.press(screen.getByText('Engineering'));
    await fireEvent.press(screen.getByText('Send verification code'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Verification code'),'123456');
    await fireEvent.press(screen.getByText('Verify email'));
    await waitFor(() => expect(screen.getByText('Take photo')).toBeTruthy());
    await fireEvent.press(screen.getByText('Take photo'));
    await waitFor(() => expect(screen.getByText('N01-23-456789')).toBeTruthy());
    expect(screen.queryByDisplayValue('N01-23-456789')).toBeNull();
    await fireEvent.press(screen.getByText('Review & create account'));
    await fireEvent.changeText(screen.getByLabelText('Choose password'),'safe-password');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'),'safe-password');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Create my account'));
    await waitFor(() => expect(screen.getByText('Your PASS account is ready')).toBeTruthy());
    const started=(global.fetch as jest.Mock).mock.calls.find(c => c[0].endsWith('/registration/sessions'));
    expect(started[1].body).toBeInstanceOf(FormData);
    expect(started[1].body.get('id_check_receipt')).toBe('signed-receipt');
    expect(started[1].body.get('first_name')).toBeNull();
    expect(started[1].body.get('birth_date')).toBeNull();
    const call=(global.fetch as jest.Mock).mock.calls.find(c => c[0].endsWith('/register'));
    expect(call[1].headers['X-Registration-Key']).toBe('owner-secret');
    expect(JSON.parse(call[1].body)).toEqual({ session_id: 'synthetic-session', password: 'safe-password', password_confirmation: 'safe-password', agree: true });
  });
});

describe('email code verification', () => {
  it('blocks invalid verification and sends exactly six digits to the public verification endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ message: 'Email verified; account active.' }));
    await render(<EmailCodeVerification initialEmail="juan@example.com" onBack={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
    expect(screen.getByText(/6-digit code/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByPlaceholderText('000000'), '12ab3456');
    await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
    await waitFor(() => expect(screen.getByText(/account active/)).toBeTruthy());
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/email/verify-code');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ email: 'juan@example.com', code: '123456' });
  });

  it('resends code and enforces a cooldown locally', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ message: 'Code sent.' }));
    await render(<EmailCodeVerification initialEmail="juan@example.com" onBack={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send / resend code' }));
    await waitFor(() => expect(screen.getByText('Code sent.')).toBeTruthy());
    expect(screen.getByText(/Resend code in/)).toBeDisabled();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/email/verification-notification');
  });

  it('preserves structured Laravel field errors for form highlighting', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ message: 'Validation failed', errors: { user_code: ['Already in use.'] } }, 422));
    await expect(api('/register', { json: {} })).rejects.toMatchObject({ status: 422, errors: { user_code: ['Already in use.'] } });
    expect(new ApiError('problem', 409).status).toBe(409);
  });
});
