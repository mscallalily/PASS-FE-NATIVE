import { useEffect, useSyncExternalStore } from 'react';
import { useAuth, type MobileUser } from '../context/AuthContext';
import { gateNotice, type GateTicket } from '../services/barrier';

const identityFor = (user: MobileUser | null, token: string | null) => user && token ? [user.id, user.role, token].join('|') : null;
/** Called by the app's auth root so logout/account changes cancel old status reads. */
export function useGateAccountBinding(user: MobileUser | null, token: string | null) {
  const identity = identityFor(user, token);
  useEffect(() => { gateNotice.identify(identity); }, [identity]);
}
/** A notice survives same-account navigation; another account cannot read or finish it. */
export function useGateNotice() {
  const { user, token } = useAuth(), identity = identityFor(user, token);
  useGateAccountBinding(user, token);
  const state = useSyncExternalStore(gateNotice.subscribe, () => gateNotice.snapshotFor(identity), () => gateNotice.snapshotFor(identity));
  return { state,
    begin: () => gateNotice.begin(identity),
    approved: (ticket: GateTicket, result: unknown, direction: 'entry' | 'exit') => { if (identity === gateNotice.currentIdentity() && token) gateNotice.approved(ticket, result, direction, token); },
    failed: (ticket: GateTicket, error: unknown) => { if (identity === gateNotice.currentIdentity()) gateNotice.failed(ticket, error); },
    finish: (ticket: GateTicket) => { if (identity === gateNotice.currentIdentity()) gateNotice.finish(ticket); },
    dismiss: () => { if (identity === gateNotice.currentIdentity()) gateNotice.dismiss(); },
    reviewed: (expectedRevision: number) => { if (identity === gateNotice.currentIdentity()) gateNotice.reviewed(expectedRevision); },
  };
}
