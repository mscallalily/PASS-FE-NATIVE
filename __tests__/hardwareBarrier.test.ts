import { GateNotice } from '../src/services/barrier';

const account = 'test-account';
const decision = { status: 'granted', barrier_status: 'pending', barrier_command_id: 7 };
const nextTurn = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function store(read = jest.fn(async () => ({ command_id: 7, status: 'acknowledged' }))) {
  const notice = new GateNotice(read, async () => {}); notice.identify(account); return { notice, read };
}
describe('mobile observation of server-authorized gate commands', () => {
  it('never creates or sends an actuator command and accepts only a matching acknowledged command', async () => {
    const { notice, read } = store(); const ticket = notice.begin(account);
    notice.approved(ticket, decision, 'entry', 'test-token'); notice.finish(ticket); await nextTurn();
    expect(read).toHaveBeenCalledWith(7, 'test-token', expect.any(AbortSignal));
    expect(notice.snapshot()).toMatchObject({ busy: false, pending: false, reviewing: false, notice: true });
    expect(notice.snapshot().message).toMatch(/acknowledged/); expect(notice.snapshot().message).toMatch(/not measured/);
  });
  it('does not request hardware for a denial, duplicate or unavailable controller', () => {
    const { notice, read } = store();
    for (const raw of [{ status: 'denied' }, { status: 'already_inside' }, { status: 'granted', barrier_status: 'unavailable', barrier_command_id: null }]) {
      const ticket = notice.begin(account); notice.approved(ticket, raw, 'entry', 'test-token'); notice.finish(ticket);
    }
    expect(read).not.toHaveBeenCalled(); expect(notice.snapshot().message).toMatch(/No servo opening was approved/);
  });
  it('blocks duplicate confirmations while waiting for a server command result', async () => {
    let done!: (value: any) => void;
    const read = jest.fn(() => new Promise<any>(resolve => { done = resolve; }));
    const { notice } = store(read); const ticket = notice.begin(account);
    notice.approved(ticket, decision, 'entry', 'test-token'); notice.finish(ticket);
    expect(() => notice.begin(account)).toThrow(/Wait/); notice.dismiss(); expect(notice.snapshot().notice).toBe(true);
    done({ command_id: 7, status: 'acknowledged' }); await nextTurn();
    expect(notice.snapshot().pending).toBe(false);
  });
  it.each(['expired', 'unconfirmed', 'failed'])('keeps %s results review-required across navigation', async status => {
    const { notice } = store(jest.fn(async () => ({ command_id: 7, status })));
    const ticket = notice.begin(account); notice.approved(ticket, decision, 'entry', 'test-token'); notice.finish(ticket); await nextTurn();
    notice.identify(account); notice.dismiss(); expect(notice.snapshot().reviewing).toBe(true); expect(() => notice.begin(account)).toThrow(/Check/);
    notice.reviewed(notice.snapshot().revision); expect(notice.snapshot().reviewing).toBe(false); expect(notice.snapshot().message).toMatch(/gate operator/);
  });
  it.each([{}, { command_id: 7, status: ['acknowledged'] }, { command_id: 8, status: 'acknowledged' }, { command_id: 7, status: 'opened' }])('requires review for malformed or mismatched status responses: %p', async raw => {
    const { notice } = store(jest.fn(async () => raw as any)); const ticket = notice.begin(account);
    notice.approved(ticket, decision, 'entry', 'test-token'); notice.finish(ticket); await nextTurn(); expect(notice.snapshot().reviewing).toBe(true);
  });
  it.each([{}, { status: 'granted', barrier_status: 'pending' }, { status: 'denied', barrier_status: 'pending', barrier_command_id: 7 }])('does not certify an incomplete gate decision: %p', raw => {
    const { notice, read } = store(); const ticket = notice.begin(account);
    notice.approved(ticket, raw, 'entry', 'test-token'); notice.finish(ticket);
    expect(notice.snapshot().reviewing).toBe(true); expect(read).not.toHaveBeenCalled();
  });
  it.each([{ status: 0 }, { status: 500 }, { status: 200, code: 'invalid_response' }])('does not allow a blind retry after an uncertain business reply: %p', error => {
    const { notice } = store(); const ticket = notice.begin(account); notice.failed(ticket, error); notice.finish(ticket);
    expect(notice.snapshot().reviewing).toBe(true); expect(() => notice.begin(account)).toThrow(/Check/);
  });
  it('keeps an ordinary rejected request distinct from an uncertain commit', () => {
    const { notice } = store(); const ticket = notice.begin(account); notice.failed(ticket, { status: 422 }); notice.finish(ticket);
    expect(notice.snapshot().reviewing).toBe(false);
  });
  it('cancels account-old status updates and masks another account notice', async () => {
    let done!: (value: any) => void;
    const { notice } = store(jest.fn(() => new Promise<any>(resolve => { done = resolve; })));
    const ticket = notice.begin(account); notice.approved(ticket, decision, 'entry', 'test-token'); notice.finish(ticket);
    expect(notice.snapshotFor('another-account').notice).toBe(false);
    notice.identify('another-account'); done({ command_id: 7, status: 'acknowledged' }); await nextTurn();
    notice.failed(ticket, { status: 500 }); expect(notice.snapshot().notice).toBe(false);
    expect(() => notice.begin(account)).toThrow(/account changed/);
  });
  it.each([undefined, null, ['unavailable']])('does not certify missing or malformed no-opening metadata: %p', barrier_status => {
    const { notice } = store(); const ticket = notice.begin(account);
    notice.approved(ticket, { status: 'granted', barrier_status, barrier_command_id: null }, 'entry', 'test-token'); notice.finish(ticket);
    expect(notice.snapshot().reviewing).toBe(true);
  });
  it('rejects a no-opening status that also carries a command ID', () => {
    const { notice } = store(); const ticket = notice.begin(account);
    notice.approved(ticket, { status: 'completed', barrier_status: 'not_requested', barrier_command_id: 8 }, 'exit', 'test-token'); notice.finish(ticket);
    expect(notice.snapshot().reviewing).toBe(true);
  });
  it('an earlier access-review checkbox cannot clear a newer hardware uncertainty', async () => {
    let done!: (value: any) => void;
    const { notice } = store(jest.fn(() => new Promise<any>(resolve => { done = resolve; })));
    const ticket = notice.begin(account); notice.approved(ticket, decision, 'entry', 'test-token');
    notice.failed(ticket, { status: 500 }); notice.finish(ticket);
    const checkedRevision = notice.snapshot().revision;
    done({ command_id: 7, status: 'failed' }); await nextTurn();
    expect(notice.snapshot().revision).toBeGreaterThan(checkedRevision);
    notice.reviewed(checkedRevision); expect(notice.snapshot().reviewing).toBe(true);
    notice.reviewed(notice.snapshot().revision); expect(notice.snapshot().reviewing).toBe(false);
  });

});
