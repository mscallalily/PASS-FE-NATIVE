import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import type { PickedFile } from '../components/ui';
import { toUploadFile } from '../api/upload';
export type LicenseStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected';
export type LicenseRecord = {
    license_id: number;
    license_number: string;
    license_type: string;
    expiry_date: string;
    original_file_name: string;
    submitted_at: string;
    verification_status: string;
    verification_reason: string | null;
    verification_source?: 'automatic' | 'staff' | null;
    verified_at?: string | null;
};
export const LICENSE_STATUS_LABEL: Record<LicenseStatus, string> = {
    not_submitted: 'Not submitted', pending: 'Pending review', verified: 'Verified', rejected: 'Needs correction',
};
type ContextType = {
    status: LicenseStatus;
    submission: LicenseRecord | null;
    rejectReason: string;
    loading: boolean;
    error: string;
    refresh: () => Promise<void>;
    submit: (input: {
        licenseNo: string;
        licenseType: string;
        expiry: string;
        file: PickedFile;
    }) => Promise<void>;
    recheck: () => Promise<void>;
};
const Ctx = createContext<ContextType | null>(null);
function statusFrom(value?: string): LicenseStatus {
    if (value === 'verified')
        return 'verified';
    if (value === 'needs_correction')
        return 'rejected';
    return value ? 'pending' : 'not_submitted';
}
export function LicenseProvider({ children }: {
    children: React.ReactNode;
}) {
    const { token, user } = useAuth();
    const [stored, setStored] = useState<{
        token: string;
        record: LicenseRecord | null;
    } | null>(null);
    const eligible = !!token && !!user && ['student', 'faculty', 'employee'].includes(user.role ?? '') && !user.accountSetup?.required && user.emailVerified !== false && (!user.accountStatus || user.accountStatus === 'active');
    const submission = eligible && stored?.token === token ? stored.record : null;
    const requestRef = useRef<AbortController | null>(null), currentToken = useRef(token);
    currentToken.current = token;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const refresh = useCallback(async () => {
        if (currentToken.current !== token)
            return;
        requestRef.current?.abort();
        if (!eligible || !token) {
            setStored(null);
            setLoading(false);
            setError('');
            return;
        }
        const request = new AbortController();
        requestRef.current = request;
        setLoading(true);
        setError('');
        try {
            const response = await api<{
                data: LicenseRecord | null;
            }>('/licenses/mine', {
                token, signal: request.signal
            });
            if (!request.signal.aborted && currentToken.current === token)
                setStored({
                    token, record: response.data ?? null
                });
        }
        catch (e) {
            if (!request.signal.aborted && currentToken.current === token)
                setError(e instanceof Error ? e.message : 'Could not load license.');
        }
        finally {
            if (!request.signal.aborted && currentToken.current === token)
                setLoading(false);
        }
    }, [token, eligible]);
    useEffect(() => {
        void refresh();
        return () => requestRef.current?.abort();
    }, [refresh]);
    const submit = async (input: {
        licenseNo: string;
        licenseType: string;
        expiry: string;
        file: PickedFile;
    }) => {
        if (!token)
            throw new Error('Sign in to submit a license.');
        const form = new FormData();
        form.append('license_number', input.licenseNo);
        form.append('license_type', input.licenseType);
        form.append('expiry_date', input.expiry);
        form.append('license_file', toUploadFile(input.file));
        await api('/licenses', {
            token, method: 'POST', form
        });
        await refresh();
    };
    const recheck = async () => {
        if (!token || !submission)
            throw new Error('Sign in and submit a license before retrying.');
        if (submission.verification_status !== 'pending_review' || submission.verification_source === 'staff') {
            throw new Error('Only an unfinished automatic license check can be retried.');
        }
        await api(`/licenses/${submission.license_id}/recheck`, {
            token, method: 'POST'
        });
        await refresh();
    };
    return <Ctx.Provider value={{
        status: statusFrom(submission?.verification_status), submission, rejectReason: submission?.verification_reason ?? '', loading, error, refresh, submit, recheck
    }}>{children}</Ctx.Provider>;
}
export function useLicense() {
    const c = useContext(Ctx);
    if (!c)
        throw new Error('No license provider');
    return c;
}
