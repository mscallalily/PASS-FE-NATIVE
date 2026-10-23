import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EmailCodeVerification from '../src/components/EmailCodeVerification';
import RegistrationForm, { REGISTRATION_STEPS } from '../src/components/RegistrationForm';
import { api, ApiError } from '../src/api/client';
import { INITIAL_REGISTRATION, institutionIdError, validateRegistrationStep } from '../src/services/registration';

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));

const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });

beforeEach(() => {
  (global as any).fetch = jest.fn();
});

describe('current institutional registration contract', () => {
  it('uses the four current web registration steps (without vehicle enrollment)', () => {
    expect(REGISTRATION_STEPS).toEqual(['User Details', 'ID Verification', 'Account Info', 'Review']);
  });

  it('validates college/employee identifiers including leading zero, separators, and year', () => {
    expect(institutionIdError('college', '2026-00123', 2026)).toBe('');
    expect(institutionIdError('college', '2027-00123', 2026)).toMatch(/later/);
    expect(institutionIdError('employee', '022-0001', 2026)).toBe('');
    expect(institutionIdError('employee', '026-0001', 2025)).toMatch(/later/);
    expect(institutionIdError('employee', '22-0001', 2026)).toMatch(/7 digits/);
    expect(institutionIdError('shs', '0001-2345-6789', 2026)).toBe('');
    expect(institutionIdError('shs', 'SHS-12345', 2026)).toMatch(/12 digits/);
  });

  it('requires a server receipt for every category including SHS', () => {
    const form = { ...INITIAL_REGISTRATION, first_name: 'Juan', last_name: 'Dela Cruz', user_code: '2026-00123' };
    expect(validateRegistrationStep(1, form, 2026, true, null).id_check_receipt).toBeTruthy();
    expect(validateRegistrationStep(1, { ...form, category: 'shs', user_code: '000123456789' }, 2026, true, null).id_check_receipt).toBeTruthy();
    expect(validateRegistrationStep(1, form, 2026, true, { receipt: 'server-only', status: 'matched',
      checks: {}, fields: {}, reasons: [], field_confidence: {}, current_year: 2026, note: '' })).toEqual({});
  });

  it('checks names, suffix, passwords, and required contact details', () => {
    const base = { ...INITIAL_REGISTRATION, department: 'Engineering', contact: '09170000000' };
    expect(validateRegistrationStep(0, base, 2026, false, null)).toEqual({});
    expect(validateRegistrationStep(2, { ...base, email: 'wrong', password: 'tiny', password_confirmation: 'different' }, 2026, false, null))
      .toMatchObject({ email: expect.any(String), password: expect.any(String), password_confirmation: expect.any(String) });
  });

  it('requires a SHS grade and section, and rejects unsafe section values', () => {
    const base = { ...INITIAL_REGISTRATION, category: 'shs' as const, department: 'Senior High School', contact: '09170000000' };
    expect(validateRegistrationStep(0, base, 2026, false, null)).toMatchObject({
      year_level: expect.any(String), section: expect.any(String),
    });
    expect(validateRegistrationStep(0, { ...base, year_level: '11', section: 'STEM A' }, 2026, false, null)).toEqual({});
    expect(validateRegistrationStep(0, { ...base, year_level: '13', section: '<b>' }, 2026, false, null)).toMatchObject({
      year_level: expect.any(String), section: expect.any(String),
    });
  });

  it('shows a compatible-backend error when new registration options are missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ message: 'Not Found' }, 404));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/matching Laravel backend/)).toBeTruthy());
    expect(screen.getByText('Continue')).toBeDisabled();
  });

  it('does not advance when the department and phone number are missing', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => Promise.resolve(response(
      url.includes('/departments') ? { data: [{ department_id: 1, department_code: 'COE', department_name: 'Engineering' }] } : { current_year: 2026 },
    )));
    await render(<RegistrationForm onBackToLogin={() => {}} />);
    await waitFor(() => expect(screen.getByText('Continue')).not.toBeDisabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/department or office/)).toBeTruthy();
    expect(screen.getByText(/Contact number is required/)).toBeTruthy();
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
