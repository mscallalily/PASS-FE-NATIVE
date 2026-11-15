import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { MobileRole } from '../context/AuthContext';
import { getParkingAvailabilitySnapshot } from '../services/parking';
import { ageParkingMap, getParkingMap, monotonicNow, type ParkingMapData } from '../services/parkingMap';

type SnapshotState = { identity: string; source: ParkingMapData | null; loading: boolean; error: string };
const isActive = () => AppState.currentState === 'active' || AppState.currentState == null;

/** One account-bound source snapshot; cached sensor health ages even without a successful poll. */
export function useParkingSnapshot({ token, role, privileged = false }: { token: string | null; role: MobileRole; privileged?: boolean }) {
  const identity = `${token ?? ''}|${role ?? ''}|${privileged ? 'staff' : 'public'}`;
  const currentIdentity = useRef(identity);
  const mounted = useRef(true), requestId = useRef(0);
  const pending = useRef<{ identity: string; request: number; controller: AbortController } | null>(null);
  const foreground = useRef(isActive());
  const [appActive, setAppActive] = useState(foreground.current);
  const [clock, setClock] = useState(monotonicNow());
  const [needsRevalidation, setNeedsRevalidation] = useState(false);
  const [state, setState] = useState<SnapshotState>({ identity, source: null, loading: !!token, error: '' });
  // Invalidate old-account replies during render, before effect cleanup runs.
  if (currentIdentity.current !== identity) {
    currentIdentity.current = identity; requestId.current++; pending.current?.controller.abort(); pending.current = null;
  }
  const refresh = useCallback(async (silent = false) => {
    if (!token || !foreground.current || pending.current?.identity === identity) return;
    const request = ++requestId.current, requestedAt = monotonicNow();
    const controller = new AbortController();
    pending.current = { identity, request, controller };
    setState(previous => previous.identity === identity
      ? { ...previous, loading: !silent || !previous.source }
      : { identity, source: null, loading: true, error: '' });
    const valid = () => !controller.signal.aborted && mounted.current && currentIdentity.current === identity && requestId.current === request;
    try {
      const response = privileged ? await getParkingMap(token, role, controller.signal) : await getParkingAvailabilitySnapshot(token, controller.signal);
      if (!valid()) return;
      const source = { ...response, clientRequestedAt: Number.isFinite(response.clientRequestedAt) ? response.clientRequestedAt : requestedAt };
      setState({ identity, source, loading: false, error: '' });
      setClock(monotonicNow()); setNeedsRevalidation(false);
    } catch (error) {
      if (valid()) setState(previous => ({ identity, source: previous.identity === identity ? previous.source : null, loading: false,
        error: error instanceof Error ? error.message : 'Parking status cannot be verified. Try refreshing.' }));
    } finally {
      if (pending.current?.request === request && pending.current.identity === identity) pending.current = null;
    }
  }, [identity, token, role, privileged]);
  useEffect(() => {
    mounted.current = true;
    setState({ identity, source: null, loading: !!token, error: '' });
    setClock(monotonicNow()); setNeedsRevalidation(false);
    void refresh();
    const age = setInterval(() => { if (foreground.current) setClock(monotonicNow()); }, 1000);
    const poll = setInterval(() => { if (foreground.current) void refresh(true); }, 5000);
    const subscription = AppState.addEventListener('change', next => {
      foreground.current = next === 'active'; setAppActive(foreground.current); setClock(monotonicNow());
      // Resume always revalidates, including platforms whose monotonic clock pauses in deep sleep.
      requestId.current++; pending.current?.controller.abort(); pending.current = null; setNeedsRevalidation(true);
      if (foreground.current) void refresh(true);
    });
    return () => {
      mounted.current = false; requestId.current++; pending.current?.controller.abort(); pending.current = null;
      clearInterval(age); clearInterval(poll); subscription.remove();
    };
  }, [identity, token, refresh]);
  const current = state.identity === identity ? state : { identity, source: null, loading: !!token, error: '' };
  const age = current.source?.clientRequestedAt !== undefined ? clock - current.source.clientRequestedAt : Infinity;
  const fresh = !!current.source && appActive && !needsRevalidation && !current.error && age >= 0 && age <= 12000;
  const data = current.source ? ageParkingMap(current.source, clock) : null;
  return { data, fresh, loading: current.loading, error: current.error, refresh };
}
