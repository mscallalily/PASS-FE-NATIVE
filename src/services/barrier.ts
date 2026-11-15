import { api } from '../api/client';

export type GateTicket = Readonly<{ generation: number }>;
export type GateNoticeState = Readonly<{
  busy: boolean; pending: boolean; reviewing: boolean; notice: boolean; message: string; revision: number;
}>;
export const EMPTY_GATE_NOTICE: GateNoticeState = Object.freeze({
  busy: false, pending: false, reviewing: false, notice: false, message: '', revision: 0,
});
type ReadStatus = (id: number, token: string, signal: AbortSignal) => Promise<unknown>;
const knownDecisions = new Set(['granted', 'completed', 'denied', 'already_inside', 'not_inside', 'not_found']);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Business actions use Laravel; this store only observes its queued hardware result. */
export class GateNotice {
  private state: GateNoticeState = EMPTY_GATE_NOTICE;
  private listeners = new Set<() => void>();
  private generation = 0;
  private operation: GateTicket | null = null;
  private monitor: AbortController | null = null;
  private identity: string | null = null;
  constructor(
    private readonly readStatus: ReadStatus = (id, token, signal) => api('/parking/barrier-commands/' + id, { token, signal, timeoutMs: 6000 }),
    private readonly wait: (signal: AbortSignal) => Promise<void> = signal => new Promise(resolve => {
      if (signal.aborted) { resolve(); return; }
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, 1000); signal.addEventListener('abort', done, { once: true });
    }),
  ) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  currentIdentity = () => this.identity;
  snapshot = () => this.state;
  snapshotFor = (identity: string | null) => identity !== null && identity === this.identity ? this.state : EMPTY_GATE_NOTICE;
  private update(change: Partial<GateNoticeState>) {
    this.state = { ...this.state, ...change, revision: this.state.revision + 1 };
    this.listeners.forEach(listener => listener());
  }
  identify(identity: string | null) {
    if (identity === this.identity) return;
    this.monitor?.abort(); this.monitor = null; this.operation = null; this.generation++;
    this.identity = identity; this.state = { ...EMPTY_GATE_NOTICE, revision: this.state.revision + 1 };
    this.listeners.forEach(listener => listener());
  }
  begin(identity: string | null): GateTicket {
    if (!identity || identity !== this.identity) throw new Error('The signed-in account changed. Reload this screen before recording an action.');
    if (this.state.reviewing) throw new Error('Check the previous uncertain access record and gate result before another transaction.');
    if (this.operation || this.state.busy || this.state.pending) throw new Error('Wait for the current PASS gate result.');
    const ticket = Object.freeze({ generation: ++this.generation }); this.operation = ticket;
    this.update({ busy: true, pending: false, notice: true, message: 'Waiting for PASS to record the gate action…' });
    return ticket;
  }
  private uncertain(message: string) { this.update({ pending: false, reviewing: true, notice: true, message }); }
  approved(ticket: GateTicket, raw: unknown, direction: 'entry' | 'exit', token: string) {
    if (this.operation !== ticket || ticket.generation !== this.generation) return;
    const result = object(raw);
    if (!result || typeof result.status !== 'string' || !knownDecisions.has(result.status)) {
      this.uncertain('PASS returned an incomplete gate result. Check access records and the physical gate before another transaction.'); return;
    }
    const granted = result.status === (direction === 'entry' ? 'granted' : 'completed');
    if (!granted) {
      if (result.barrier_status === 'pending') this.uncertain('The gate result is inconsistent. Check access records and the gate operator; do not repeat the transaction.');
      else this.update({ notice: true, message: 'PASS did not approve a new opening. Check the recorded access decision.' });
      return;
    }
    if (result.barrier_status === 'pending') {
      const id = result.barrier_command_id;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
        this.uncertain('The action was recorded, but its opening request cannot be verified. Check access records and the gate operator.'); return;
      }
      this.update({ pending: true, notice: true, message: 'Recorded in PASS. OPEN is queued for the gate PC; physical movement is not yet confirmed.' });
      const monitor = new AbortController(); this.monitor = monitor;
      void this.observe(id, token, ticket.generation, monitor);
      return;
    }
    if ((result.barrier_status !== 'unavailable' && result.barrier_status !== 'not_requested') || result.barrier_command_id !== null) {
      this.uncertain('The action was recorded, but PASS returned an unknown hardware result. Check the access record and gate operator.'); return;
    }
    this.update({ notice: true, message: result.barrier_status === 'unavailable'
      ? 'Recorded in PASS. No servo opening was approved. Check Hardware & Station and the gate operator; do not repeat this recorded transaction.'
      : 'Recorded in PASS. No automatic opening was queued. Check the gate operator before passage.' });
  }
  private async observe(id: number, token: string, generation: number, monitor: AbortController) {
    try {
      for (let attempt = 0; attempt < 20; attempt++) {
        if (generation !== this.generation || monitor.signal.aborted) return;
        const response = object(await this.readStatus(id, token, monitor.signal));
        if (generation !== this.generation || monitor.signal.aborted) return;
        if (!response || response.command_id !== id || typeof response.status !== 'string' || !['pending', 'claimed', 'acknowledged', 'expired', 'unconfirmed', 'failed'].includes(response.status)) {
          throw new Error('Invalid hardware result.');
        }
        if (response.status === 'acknowledged') {
          this.update({ pending: false, notice: true, message: 'OPEN command acknowledged by the gate PC. Visually check the miniature barrier and passage; arm position is not measured.' }); return;
        }
        if (['expired', 'unconfirmed', 'failed'].includes(String(response.status))) {
          this.uncertain('The access action is recorded, but OPEN was not confirmed. Check the access record and gate operator; do not repeat the transaction.'); return;
        }
        await this.wait(monitor.signal);
      }
      if (generation === this.generation && !monitor.signal.aborted) this.uncertain('The access action is recorded, but hardware confirmation timed out. Check records and the gate operator before another transaction.');
    } catch {
      if (generation === this.generation && !monitor.signal.aborted) this.uncertain('The access action is recorded, but hardware status is unavailable. Check records and the gate operator; do not repeat it.');
    } finally { if (this.monitor === monitor) this.monitor = null; }
  }
  failed(ticket: GateTicket, error: unknown) {
    if (this.operation !== ticket || ticket.generation !== this.generation) return;
    const failure = object(error), status = Number(failure?.status), code = failure?.code;
    if (!status || status >= 500 || code === 'invalid_response' || code === 'request_timeout') {
      this.uncertain('PASS may have saved the action before the connection failed. Check access records and the gate operator before another transaction.');
    } else this.update({ notice: true, message: 'PASS rejected this request. Check the reported reason; no new opening was requested by this screen.' });
  }
  finish(ticket: GateTicket) {
    if (this.operation !== ticket || ticket.generation !== this.generation) return;
    this.operation = null; this.update({ busy: false });
  }
  dismiss() { if (!this.state.busy && !this.state.pending && !this.state.reviewing) this.update({ notice: false }); }
  reviewed(expectedRevision: number) {
    if (!this.state.reviewing || expectedRevision !== this.state.revision || this.state.busy || this.state.pending || this.operation) return;
    this.update({ reviewing: false, notice: true, message: 'Access-record review confirmed. Physical controller review and supervised CLOSE remain with the gate operator.' });
  }
}
export const gateNotice = new GateNotice();
