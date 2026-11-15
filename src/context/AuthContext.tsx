import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError, onInvalidSession } from '../api/client';
export type MobileRole = 'student' | 'faculty' | 'employee' | 'parking_staff' | 'security' | 'admin' | 'parking_admin' | 'guest' | null;
export interface MobileUser {
    id: string;
    name: string;
    email: string;
    role: MobileRole;
    idNum?: string;
    dept?: string;
    accountStatus?: string;
    emailVerified?: boolean;
    registrationCategory?: string;
    schoolIdCheckStatus?: string;
    yearLevel?: string;
    section?: string;
    accountSetup?: {
        required: boolean;
        step: 'verify_email' | 'change_password' | 'complete';
        expired?: boolean;
        expiresAt?: string;
        resendAvailableAt?: string;
        delivery?: string;
    } | null;
}
const TOKEN_KEY = 'pass_auth_token';
/** Preserve backend role codes, including security and parking_admin. */
function normalizeRole(role: string | null | undefined): MobileRole {
    switch (role?.toLowerCase()) {
        case 'admin':
        case 'administrator':
            return 'admin';
        case 'security': return 'security';
        case 'parking_admin': return 'parking_admin';
        case 'parking':
        case 'parking_staff': return 'parking_staff';
        case 'student':
        case 'faculty':
        case 'employee':
        case 'guest':
            return role!.toLowerCase() as MobileRole;
        default:
            return null;
    }
}
function toUser(u: any): MobileUser {
    if (!u || !['string', 'number'].includes(typeof u.id) || !String(u.id) || typeof u.email !== 'string')
        throw new Error('PASS returned an incomplete account response. Please try again.');
    const role = normalizeRole(u.role);
    if (!role) {
        throw new Error('Your account has no recognized PASS role. Please contact the administrator.');
    }
    return {
        id: String(u.id), name: u.name, email: u.email, role, idNum: u.idNum, dept: u.dept,
        accountStatus: u.accountStatus, emailVerified: u.emailVerified, registrationCategory: u.registrationCategory,
        schoolIdCheckStatus: u.schoolIdCheckStatus, yearLevel: u.yearLevel, section: u.section,
        accountSetup: u.accountSetup ?? null
    };
}
// Match Laravel's login policy: existing privileged accounts can sign in
// without a public-registration email code. Newly invited staff are still
// restricted by their separate account setup flow.
function requiresPublicEmailVerification(user: MobileUser): boolean {
    return user.emailVerified === false
        && ['student', 'faculty', 'employee', 'guest'].includes(user.role ?? '')
        && !user.accountSetup?.required;
}
interface AuthCtx {
    user: MobileUser | null;
    token: string | null;
    restoring: boolean;
    restoreError: string;
    retryRestore: () => void;
    login: (identifier: string, password: string) => Promise<void>;
    continueAsGuest: () => void;
    refreshUser: () => Promise<void>;
    finishAccountSetup: (normalToken: string) => Promise<void>;
    logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export function AuthProvider({ children }: {
    children: React.ReactNode;
}) {
    const [user, setUser] = useState<MobileUser | null>(null), [token, setToken] = useState<string | null>(null), [restoring, setRestoring] = useState(true);
    const [restoreError, setRestoreError] = useState(''), [revision, setRevision] = useState(0);
    const generation = useRef(0), storageQueue = useRef<Promise<void>>(Promise.resolve());
    const storeToken = useCallback((value: string | null, version: number, expected?: string) => {
        const work = storageQueue.current.catch(() => {
        }).then(async () => {
            if (version !== generation.current)
                return false;
            if (expected !== undefined && await SecureStore.getItemAsync(TOKEN_KEY) !== expected)
                return false;
            if (version !== generation.current)
                return false;
            if (value === null)
                await SecureStore.deleteItemAsync(TOKEN_KEY);
            else
                await SecureStore.setItemAsync(TOKEN_KEY, value);
            return version === generation.current;
        });
        storageQueue.current = work.then(() => {
        }, () => {
        });
        return work;
    }, []);
    const retryRestore = useCallback(() => {
        setRestoreError('');
        setRestoring(true);
        setRevision(v => v + 1);
    }, []);
    useEffect(() => {
        const controller = new AbortController(), version = ++generation.current;
        const current = () => !controller.signal.aborted && generation.current === version;
        (async () => {
            let stored: string | null = null;
            try {
                stored = await SecureStore.getItemAsync(TOKEN_KEY);
                if (!stored || !current())
                    return;
                const data = await api<{
                    user: any;
                }>('/me', {
                    token: stored, signal: controller.signal
                });
                if (!current())
                    return;
                const u = toUser(data.user);
                if (u.accountStatus && !['active', 'pending'].includes(u.accountStatus))
                    throw new ApiError('This account is not active.', 403, {}, 'account_not_active');
                if (requiresPublicEmailVerification(u))
                    throw new ApiError('Verify your email before signing in.', 403, {}, 'email_unverified');
                setUser(u);
                setToken(stored);
                setRestoreError('');
            }
            catch (error) {
                if (!current())
                    return;
                const denied = error instanceof ApiError && (error.status === 401 || error.status === 403 && ['account_not_active', 'email_unverified'].includes(error.code));
                if (denied) {
                    if (stored)
                        await storeToken(null, version, stored).catch(() => false);
                    if (current()) {
                        setUser(null);
                        setToken(null);
                        setRestoreError('');
                    }
                }
                else if (current())
                    setRestoreError(error instanceof Error ? error.message : 'Cannot check your saved session right now.');
            }
            finally {
                if (current())
                    setRestoring(false);
            }
        })();
        return () => controller.abort();
    }, [revision, storeToken]);
    useEffect(() => onInvalidSession(expired => {
        if (!token || expired !== token)
            return;
        const version = ++generation.current;
        setUser(null);
        setToken(null);
        setRestoreError('');
        setRestoring(false);
        void storeToken(null, version, expired).catch(() => false);
    }), [token, storeToken]);
    const login = useCallback(async (identifier: string, password: string) => {
        const version = ++generation.current;
        try {
            const data = await api<{
                token?: string;
                user?: any;
            }>('/login', {
                json: {
                    identifier: identifier.trim(), password
                }
            });
            if (!data.token || !data.user)
                throw new Error('The server returned an incomplete login response.');
            const u = toUser(data.user);
            if (u.accountStatus && !['active', 'pending'].includes(u.accountStatus))
                throw new Error(`Account status: ${u.accountStatus}. Contact the PASS administrator.`);
            if (requiresPublicEmailVerification(u))
                throw new Error('Verify your email address before accessing the mobile dashboard.');
            if (version !== generation.current || !await storeToken(data.token, version))
                throw new ApiError('Sign-in request cancelled.', 0, {}, 'cancelled');
            setToken(data.token);
            setUser(u);
            setRestoreError('');
        }
        finally {
            if (version === generation.current)
                setRestoring(false);
        }
    }, [storeToken]);
    const refreshUser = useCallback(async () => {
        if (!token)
            return;
        const version = generation.current;
        const result = await api<{
            user: any;
        }>('/me', {
            token
        }), updated = toUser(result.user);
        if (requiresPublicEmailVerification(updated) || (updated.accountStatus && !['active', 'pending'].includes(updated.accountStatus))) {
            if (version === generation.current) {
                const next = ++generation.current;
                setUser(null);
                setToken(null);
                setRestoreError('');
                await storeToken(null, next, token).catch(() => false);
            }
            throw new Error('This account is not currently eligible for access. Contact the PASS office.');
        }
        if (version === generation.current)
            setUser(updated);
    }, [token, storeToken]);
    const finishAccountSetup = useCallback(async (normalToken: string) => {
        const version = ++generation.current, result = await api<{
            user: any;
        }>('/me', {
            token: normalToken
        }), updated = toUser(result.user);
        if (updated.accountSetup?.required || updated.accountStatus !== 'active' || updated.emailVerified === false)
            throw new Error('PASS has not fully activated this account. Please contact the administrator.');
        if (version !== generation.current || !await storeToken(normalToken, version))
            throw new ApiError('Account setup request cancelled.', 0, {}, 'cancelled');
        setToken(normalToken);
        setUser(updated);
        setRestoreError('');
        setRestoring(false);
    }, [storeToken]);
    const continueAsGuest = useCallback(() => {
        const version = ++generation.current;
        setRestoreError('');
        setRestoring(false);
        setToken(null);
        setUser({
            id: 'guest', name: 'Guest User', role: 'guest', email: ''
        });
        void storeToken(null, version).catch(() => false);
    }, [storeToken]);
    const logout = useCallback(async () => {
        const version = ++generation.current, t = token;
        setUser(null);
        setToken(null);
        setRestoreError('');
        setRestoring(false);
        await storeToken(null, version).catch(() => false);
        if (t)
            await api('/logout', {
                method: 'POST', token: t
            }).catch(() => {
            });
    }, [token, storeToken]);
    return <Ctx.Provider value={{
        user, token, restoring, restoreError, retryRestore, login, continueAsGuest, refreshUser, finishAccountSetup, logout
    }}>
    {restoreError && !user && !restoring ? <View style={{
            flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#F4F7FB'
        }}>
      <Text accessibilityRole="header" style={{
            fontSize: 22, fontWeight: '700', color: '#080677'
        }}>Unable to check your session</Text>
      <Text accessibilityRole="alert" style={{
            fontSize: 14, color: '#334155'
        }}>{restoreError}</Text>
      <Text style={{
            fontSize: 14, color: '#475569'
        }}>Your saved sign-in is kept. Reconnect and retry to continue securely.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry saved session" onPress={retryRestore} style={{
            backgroundColor: '#1D4ED8', padding: 15, borderRadius: 12
        }}><Text style={{
            color: '#FFF', textAlign: 'center', fontWeight: '600'
        }}>Retry</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out on this device" onPress={() => {
            void logout();
        }} style={{
            padding: 14
        }}><Text style={{
            color: '#1D4ED8', textAlign: 'center'
        }}>Sign out on this device</Text></Pressable>
    </View> : children}
  </Ctx.Provider>;
}
export function useAuth() {
    const c = useContext(Ctx);
    if (!c) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return c;
}
