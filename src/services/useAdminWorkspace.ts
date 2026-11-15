import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../permissions';
export function useAdminRead<T>(path: string, parse: (value: T) => T) {
    const { user, token } = useAuth(), allowed = !!token && isAdmin(user?.role ?? null);
    const scope = `${user?.id ?? ''}|${user?.role ?? ''}|${token ?? ''}`;
    const [revision, setRevision] = useState(0), key = `${scope}|${path}|${revision}`;
    const latest = useRef(key);
    latest.current = key;
    const [result, setResult] = useState<{
        key: string;
        data: T | null;
        error: string;
        loading: boolean;
    } | null>(null);
    const refresh = useCallback(() => setRevision(v => v + 1), []);
    useEffect(() => {
        if (!allowed || !token)
            return;
        const controller = new AbortController();
        setResult({ key, data: null, error: '', loading: true });
        api<T>(path, { token, signal: controller.signal }).then(value => {
            if (!controller.signal.aborted && latest.current === key)
                setResult({ key, data: parse(value), error: '', loading: false });
        }).catch(error => {
            if (!controller.signal.aborted && latest.current === key)
                setResult({ key, data: null, error: error instanceof Error ? error.message : 'PASS could not load this workspace.', loading: false });
        });
        return () => controller.abort();
    }, [allowed, token, path, key, parse]);
    const visible = allowed && result?.key === key ? result : null;
    return { allowed, scope, token, data: visible?.data ?? null, error: visible?.error ?? '', loading: allowed && (!visible || visible.loading), refresh };
}
export function useAdminAction(scope: string, token: string | null, allowed: boolean) {
    const [result, setResult] = useState<{
        scope: string;
        message: string;
        error: string;
        busy: boolean;
    } | null>(null);
    const current = useRef({ scope, token, allowed });
    current.current = { scope, token, allowed };
    const lock = useRef(false), mounted = useRef(true), request = useRef<AbortController | null>(null);
    useEffect(() => {
        mounted.current = true;
        lock.current = false;
        request.current?.abort();
        return () => { mounted.current = false; request.current?.abort(); };
    }, [scope]);
    const clear = () => setResult(null);
    const run = async (path: string, json: Record<string, unknown>): Promise<boolean> => {
        if (!allowed || !token || !mounted.current || current.current.scope !== scope || lock.current)
            return false;
        lock.current = true;
        const controller = new AbortController();
        request.current = controller;
        setResult({ scope, message: '', error: '', busy: true });
        try {
            const response = await api<{
                message?: string;
            }>(path, { token, method: 'POST', json, signal: controller.signal });
            if (!mounted.current || controller.signal.aborted || current.current.scope !== scope)
                return false;
            setResult({ scope, message: typeof response.message === 'string' ? response.message : 'Saved.', error: '', busy: false });
            return true;
        }
        catch (error) {
            if (mounted.current && !controller.signal.aborted && current.current.scope === scope)
                setResult({ scope, message: '', error: error instanceof Error ? error.message : 'The action could not be completed.', busy: false });
            return false;
        }
        finally {
            if (request.current === controller) {
                lock.current = false;
                request.current = null;
            }
        }
    };
    const visible = allowed && result?.scope === scope ? result : null;
    return { run, clear, busy: visible?.busy ?? false, error: visible?.error ?? '', message: visible?.message ?? '' };
}
