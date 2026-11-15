import { API_URL } from '../config';
export class ApiError extends Error {
    constructor(message: string, public status: number, public errors: Record<string, string[]> = {}, public code = '') {
        super(message);
        this.name = 'ApiError';
    }
}
export type ApiOptions = {
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    token?: string | null;
    json?: unknown;
    form?: FormData;
    signal?: AbortSignal;
    timeoutMs?: number;
};
const listeners = new Set<(token: string) => void>();
export function onInvalidSession(listener: (token: string) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
function invalid(token: string | null | undefined, status: number, code: string) {
    if (token && (status === 401 || status === 403 && ['account_not_active', 'email_unverified'].includes(code)))
        for (const listener of listeners)
            listener(token);
}
function aborted() {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}
async function request<T>(path: string, opts: ApiOptions, read: (r: Response) => Promise<T>): Promise<T> {
    const headers: Record<string, string> = {
        Accept: 'application/json', ...opts.headers
    };
    if (opts.token)
        headers.Authorization = `Bearer ${opts.token}`;
    let body: FormData | string | undefined;
    if (opts.form)
        body = opts.form;
    else if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.json);
    }
    const method = opts.method ?? (body ? 'POST' : 'GET');
    const uncertain = method === 'GET' ? '' : ' Check whether the change was saved before trying again.';
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: (() => void) | undefined;
    const deadline = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(aborted());
        controller.signal.addEventListener('abort', rejectAbort, {
            once: true
        });
    });
    const abort = () => controller.abort();
    opts.signal?.addEventListener('abort', abort, {
        once: true
    });
    if (opts.signal?.aborted)
        abort();
    const timer = setTimeout(() => {
        timedOut = true;
        abort();
    }, opts.timeoutMs ?? (opts.form ? 120000 : 30000));
    try {
        const response = (async () => {
            if (controller.signal.aborted)
                throw aborted();
            const res = await fetch(`${API_URL}/api${path}`, {
                method, headers, body, signal: controller.signal
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (controller.signal.aborted)
                    throw aborted();
                const code = typeof data?.code === 'string' ? data.code : 'http_error';
                invalid(opts.token, res.status, code);
                const fields = Object.values(data?.errors ?? {}).flatMap(value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : []);
                throw new ApiError(fields.length ? fields.join(' ') : typeof data?.message === 'string' ? data.message : `Request failed with status ${res.status}.`, res.status, data?.errors ?? {}, code);
            }
            return read(res);
        })();
        return await Promise.race([response, deadline]);
    }
    catch (error) {
        if (opts.signal?.aborted)
            throw new ApiError('Request cancelled.', 0, {}, 'cancelled');
        if (timedOut)
            throw new ApiError('PASS took too long to respond.' + uncertain + ' Please try again when your connection is stable.', 0, {}, 'request_timeout');
        if (error instanceof ApiError)
            throw error;
        throw new ApiError(`Cannot reach the PASS server at ${API_URL}. Check your connection.` + uncertain, 0, {}, 'network_error');
    }
    finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', abort);
        if (rejectAbort)
            controller.signal.removeEventListener('abort', rejectAbort);
    }
}
export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
    return request(path, opts, async (response) => {
        if ([204, 205].includes(response.status))
            return undefined as T;
        try {
            if (response.headers && !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''))
                throw new Error('Not JSON');
            const data = await response.json();
            if (data === null || typeof data !== 'object')
                throw new Error('Invalid API shape');
            return data as T;
        }
        catch {
            throw new ApiError('PASS returned an incomplete or unexpected response. Check whether any submitted change was saved before trying again.', response.status, {}, 'invalid_response');
        }
    });
}
export async function apiBlob(path: string, opts: ApiOptions = {}): Promise<Blob> {
    return request(path, {
        ...opts, timeoutMs: opts.timeoutMs ?? 60000
    }, response => response.blob());
}
