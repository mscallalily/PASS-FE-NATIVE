import { API_URL } from '../config';

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  constructor(message: string, status: number, errors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string | null;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Flatten Laravel validation errors ({errors: {field: [msg]}}) into one readable message. */
function messageFrom(data: any, status: number): string {
  if (data?.errors && typeof data.errors === 'object') {
    const all = (Object.values(data.errors) as string[][]).flat();
    if (all.length) return all.join(' ');
  }
  return data?.message || `Request failed with status ${status}.`;
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.form) body = opts.form; // let fetch set the multipart boundary
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? (opts.form ? 110000 : 30000));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: controller.signal,
    });
  } catch (e) {
    // Include the underlying reason so connection problems can be diagnosed (timeout vs. refused vs. upload failure).
    const reason = e instanceof Error ? (e.name === 'AbortError' ? 'timed out' : e.message) : String(e);
    if (opts.signal?.aborted) throw new ApiError('Request cancelled.', 0);
    throw new ApiError(
      `Cannot reach the PASS server at ${API_URL}. Check your connection and EXPO_PUBLIC_API_URL. (${reason})`,
      0,
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abort);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(messageFrom(data, res.status), res.status, data?.errors ?? {});
  return data as T;
}
