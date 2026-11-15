import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { api } from '../src/api/client';
import VisitorPassVerifier from '../src/components/VisitorPassVerifier';

const passCode = '45109880-5ced-457e-9982-35f4b5567635';

jest.mock('../src/api/client', () => ({ api: jest.fn() }));
jest.mock('expo-camera', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (scan: { data: string }) => void }) =>
      React.createElement(Pressable, { testID: 'camera', onPress: () => onBarcodeScanned?.({ data: '45109880-5ced-457e-9982-35f4b5567635' }) },
        React.createElement(Text, null, 'Camera test surface')),
  };
});

describe('Verify Visitor Pass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api as jest.Mock).mockResolvedValue({
      qr_pass_id: 12, pass_code: passCode, status: 'active', stored_status: 'active',
      visitor_name: 'Approved Visitor', plate_number: 'ABC 1234', vehicle_type: 'Car',
      valid_from: null, valid_until: null, entry_allowed: true, entry_problem: null, inside: null,
    });
  });

  it('looks up a manually entered pass in Laravel', async () => {
    const view = await render(<VisitorPassVerifier token="user-session" />);
    await fireEvent.changeText(view.getByLabelText('Visitor QR pass code'), passCode);
    await fireEvent.press(view.getByText('Look up pass'));
    expect(api).toHaveBeenCalledWith(`/visitors/passes/lookup?code=${passCode}`, { token: 'user-session' });
    expect(view.getByText('Valid for entry')).toBeTruthy();
  });

  it('scans from the camera and looks up the same code only once', async () => {
    const view = await render(<VisitorPassVerifier token="user-session" />);
    await fireEvent.press(view.getByText('Scan QR code'));
    await fireEvent.press(view.getByTestId('camera'));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(`/visitors/passes/lookup?code=${passCode}`, { token: 'user-session' });
    expect(view.getByText('Valid for entry')).toBeTruthy();
  });
});
