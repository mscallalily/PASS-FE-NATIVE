import React from 'react';
import { AppState, Text } from 'react-native';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { useParkingSnapshot } from '../src/hooks/useParkingSnapshot';
import { getParkingAvailabilitySnapshot } from '../src/services/parking';
import { getParkingMap, type ParkingMapData } from '../src/services/parkingMap';
import type { MobileRole } from '../src/context/AuthContext';

jest.mock('../src/services/parking', () => ({ getParkingAvailabilitySnapshot: jest.fn() }));
jest.mock('../src/services/parkingMap', () => ({
  getParkingMap: jest.fn(), ageParkingMap: (data: unknown) => data, monotonicNow: () => Date.now(),
}));
const listeners = new Set<(state: string) => void>();
const snapshot = (available = 3) => ({ slots: [], areas: [], overall: { capacity: 5, available, occupied: 2 }, generated_at: new Date().toISOString(), hasStaffDetails: false }) as unknown as ParkingMapData;
function Harness({ token, role = 'student', privileged = false }: { token: string; role?: MobileRole; privileged?: boolean }) {
  const result = useParkingSnapshot({ token, role, privileged });
  return <><Text>{result.fresh ? `${result.data?.overall?.available} available` : 'Availability hidden'}</Text><Text>{result.error}</Text></>;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function tick(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
async function appState(value: string) { await act(async () => { for (const listener of [...listeners]) listener(value); }); }

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-09T01:00:00Z'));
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  listeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener: any) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; });
  (getParkingAvailabilitySnapshot as jest.Mock).mockReset().mockResolvedValue(snapshot());
  (getParkingMap as jest.Mock).mockReset().mockResolvedValue(snapshot());
});
afterEach(async () => { await cleanup(); listeners.clear(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('home and summary use the public snapshot; only a privileged map uses role-aware records', async () => {
  const view = await render(<Harness token="public-token"/>);
  expect(screen.getByText('3 available')).toBeTruthy();
  expect(getParkingAvailabilitySnapshot).toHaveBeenCalledWith('public-token', expect.objectContaining({aborted:false})); expect(getParkingMap).not.toHaveBeenCalled();
  await view.rerender(<Harness token="staff-token" role="security" privileged/>);
  expect(getParkingMap).toHaveBeenCalledWith('staff-token', 'security', expect.objectContaining({aborted:false}));
});

test('a stalled poll hides old availability after twelve seconds without fabricating new counts', async () => {
  await render(<Harness token="token"/>); expect(screen.getByText('3 available')).toBeTruthy();
  (getParkingAvailabilitySnapshot as jest.Mock).mockImplementation(() => new Promise(() => {}));
  await tick(13000);
  expect(screen.queryByText('3 available')).toBeNull(); expect(screen.getByText('Availability hidden')).toBeTruthy();
});

test('a failed poll immediately masks the retained source until a successful refresh', async () => {
  await render(<Harness token="token"/>);
  (getParkingAvailabilitySnapshot as jest.Mock).mockRejectedValueOnce(new Error('Parking API offline'));
  await tick(5000);
  expect(screen.queryByText('3 available')).toBeNull(); expect(screen.getByText('Parking API offline')).toBeTruthy();
  await tick(5000); expect(screen.getByText('3 available')).toBeTruthy();
});

test('an old account response cannot replace the next account snapshot', async () => {
  const old = deferred<ParkingMapData>();
  (getParkingAvailabilitySnapshot as jest.Mock).mockImplementation((token: string) => token === 'old' ? old.promise : Promise.resolve(snapshot(1)));
  const view = await render(<Harness token="old"/>);
  const oldSignal = (getParkingAvailabilitySnapshot as jest.Mock).mock.calls[0][1] as AbortSignal;
  await view.rerender(<Harness token="new"/>); expect(oldSignal.aborted).toBe(true); expect(screen.getByText('1 available')).toBeTruthy();
  await act(async () => { old.resolve(snapshot(99)); });
  expect(screen.getByText('1 available')).toBeTruthy(); expect(screen.queryByText('99 available')).toBeNull();
});

test('resume requires a new response even when the device clock has barely advanced', async () => {
  await render(<Harness token="token"/>);
  await appState('background'); expect(screen.getByText('Availability hidden')).toBeTruthy();
  const resumed = deferred<ParkingMapData>(); (getParkingAvailabilitySnapshot as jest.Mock).mockReturnValue(resumed.promise);
  await appState('active'); expect(screen.getByText('Availability hidden')).toBeTruthy();
  await act(async () => { resumed.resolve(snapshot(2)); }); expect(screen.getByText('2 available')).toBeTruthy();
});

test('background requests are discarded and unmount removes listeners and polling', async () => {
  const pending = deferred<ParkingMapData>(); (getParkingAvailabilitySnapshot as jest.Mock).mockReturnValue(pending.promise);
  const view = await render(<Harness token="token"/>);
  await appState('background'); await act(async () => { pending.resolve(snapshot(99)); });
  expect(screen.getByText('Availability hidden')).toBeTruthy();
  await view.unmount(); expect(listeners.size).toBe(0);
  const before = (getParkingAvailabilitySnapshot as jest.Mock).mock.calls.length;
  await tick(15000); expect((getParkingAvailabilitySnapshot as jest.Mock).mock.calls.length).toBe(before);
});

test('background, resume and unmount cancel HTTP reads rather than leaving overlaps pending', async () => {
  (getParkingAvailabilitySnapshot as jest.Mock).mockImplementation(() => new Promise(() => {}));
  const view = await render(<Harness token="token"/>);
  const before = (getParkingAvailabilitySnapshot as jest.Mock).mock.calls[0][1] as AbortSignal;
  expect(before.aborted).toBe(false);
  await appState('background'); expect(before.aborted).toBe(true);
  await appState('active');
  const resumed = (getParkingAvailabilitySnapshot as jest.Mock).mock.calls[1][1] as AbortSignal;
  expect(resumed.aborted).toBe(false);
  await view.unmount(); expect(resumed.aborted).toBe(true);
});
