import { api, apiBlob, ApiError, onInvalidSession } from '../src/api/client';
const response = (status: number, data: unknown, type = 'application/json') => ({
    ok: status >= 200 && status < 300, status, headers: {
        get: () => type
    }, json: async () => data
});
const pending = () => new Promise<never>(() => {
});
beforeEach(() => {
    global.fetch = jest.fn() as any;
});
afterEach(() => {
    jest.useRealTimers();
});
describe('bounded API bodies and authoritative session rejection', () => {
    it.each([null, 'not an object', 42])('rejects malformed success %s', async (data) => {
        (fetch as jest.Mock).mockResolvedValue(response(200, data));
        await expect(api('/me')).rejects.toMatchObject({
            code: 'invalid_response'
        });
    });
    it('rejects HTML and invalid JSON rather than reporting an empty success', async () => {
        (fetch as jest.Mock).mockResolvedValue(response(200, {}, 'text/html'));
        await expect(api('/vehicles', {
            method: 'POST', json: {}
        })).rejects.toMatchObject({
            code: 'invalid_response'
        });
        (fetch as jest.Mock).mockResolvedValue({
            ...response(200, {}), json: async () => {
                throw new Error('bad JSON');
            }
        });
        await expect(api('/me')).rejects.toMatchObject({
            code: 'invalid_response'
        });
    });
    it('accepts 204 responses and vendor JSON', async () => {
        (fetch as jest.Mock).mockResolvedValue(response(204, undefined, ''));
        await expect(api('/logout', {
            method: 'POST'
        })).resolves.toBeUndefined();
        (fetch as jest.Mock).mockResolvedValue(response(200, {
            ok: true
        }, 'application/problem+json; charset=utf-8'));
        await expect(api('/example')).resolves.toEqual({
            ok: true
        });
    });
    it('bounds a stalled success body even when fetch ignores abort', async () => {
        jest.useFakeTimers();
        (fetch as jest.Mock).mockResolvedValue({
            ...response(200, {}), json: pending
        });
        const result = api('/vehicles', {
            method: 'POST', json: {}, timeoutMs: 30
        }).catch(e => e);
        await jest.advanceTimersByTimeAsync(31);
        expect(await result).toMatchObject({
            code: 'request_timeout', status: 0
        });
        expect((await result).message).toContain('Check whether the change was saved');
        expect(jest.getTimerCount()).toBe(0);
    });
    it('bounds private-image downloads and stalled error bodies', async () => {
        jest.useFakeTimers();
        (fetch as jest.Mock).mockResolvedValue({
            ...response(200, {}), blob: pending
        });
        const image = apiBlob('/licenses/1/file', {
            timeoutMs: 10
        }).catch(e => e);
        await jest.advanceTimersByTimeAsync(11);
        expect(await image).toMatchObject({
            code: 'request_timeout'
        });
        (fetch as jest.Mock).mockResolvedValue({
            ...response(401, {}), json: pending
        });
        const failure = api('/me', {
            timeoutMs: 10
        }).catch(e => e);
        await jest.advanceTimersByTimeAsync(11);
        expect(await failure).toMatchObject({
            code: 'request_timeout'
        });
    });
    it('distinguishes cancellation from connectivity errors', async () => {
        const abort = new AbortController();
        abort.abort();
        await expect(api('/me', {
            signal: abort.signal
        })).rejects.toMatchObject({
            code: 'cancelled'
        });
        expect(fetch).not.toHaveBeenCalled();
        (fetch as jest.Mock).mockRejectedValue(new Error('offline'));
        await expect(api('/me')).rejects.toMatchObject({
            code: 'network_error'
        });
    });
    it('preserves field errors and invalidates only explicit invalid sessions', async () => {
        const listener = jest.fn(), stop = onInvalidSession(listener);
        try {
            (fetch as jest.Mock).mockResolvedValue(response(422, {
                errors: {
                    or_document: ['OR required'], cr_document: ['CR required']
                }
            }));
            await expect(api('/vehicles', {
                token: 'current'
            })).rejects.toMatchObject({
                message: 'OR required CR required', status: 422
            });
            (fetch as jest.Mock).mockResolvedValue(response(403, {
                message: 'Not your role.'
            }));
            await expect(api('/admin/users', {
                token: 'current'
            })).rejects.toBeInstanceOf(ApiError);
            expect(listener).not.toHaveBeenCalled();
            for (const status of [401, 403]) {
                (fetch as jest.Mock).mockResolvedValue(response(status, {
                    code: 'account_not_active'
                }));
                await expect(api('/me', {
                    token: 'current'
                })).rejects.toBeInstanceOf(ApiError);
            }
            expect(listener.mock.calls).toEqual([['current'], ['current']]);
        }
        finally {
            stop();
        }
    });
    it('ignores a late rejection after timing out', async () => {
        jest.useFakeTimers();
        let finish!: (value: unknown) => void;
        const listener = jest.fn(), stop = onInvalidSession(listener);
        (fetch as jest.Mock).mockResolvedValue({
            ...response(401, {}), json: () => new Promise(resolve => {
                finish = resolve;
            })
        });
        const result = api('/me', {
            token: 'saved', timeoutMs: 10
        }).catch(e => e);
        await jest.advanceTimersByTimeAsync(11);
        expect(await result).toMatchObject({
            code: 'request_timeout'
        });
        finish({
            message: 'Unauthenticated'
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(listener).not.toHaveBeenCalled();
        stop();
    });
});
