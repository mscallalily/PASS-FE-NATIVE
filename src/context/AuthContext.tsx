import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

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
  accountSetup?: { required: boolean; step: 'verify_email' | 'change_password' | 'complete'; expired?: boolean;
    expiresAt?: string; resendAvailableAt?: string; delivery?: string } | null;
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
  const role = normalizeRole(u.role);
  if (!role) {
    throw new Error('Your account has no recognized PASS role. Please contact the administrator.');
  }
  return { id: String(u.id), name: u.name, email: u.email, role, idNum: u.idNum, dept: u.dept,
    accountStatus: u.accountStatus, emailVerified: u.emailVerified, registrationCategory: u.registrationCategory,
    schoolIdCheckStatus: u.schoolIdCheckStatus, yearLevel: u.yearLevel, section: u.section,
    accountSetup: u.accountSetup ?? null };
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
  login: (identifier: string, password: string) => Promise<void>;
  continueAsGuest: () => void;
  refreshUser: () => Promise<void>;
  finishAccountSetup: (normalToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Restore the session from the stored Sanctum token (same as GET /api/me in the web app).
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) return;
        const data = await api<{ user: any }>('/me', { token: stored });
        const u = toUser(data.user);
        if (u.accountStatus && !['active', 'pending'].includes(u.accountStatus)) throw new Error('Inactive account');
        if (requiresPublicEmailVerification(u)) throw new Error('Email not verified');
        setUser(u);
        setToken(stored);
      } catch {
         await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api<{ token?: string; user?: any }>('/login', {
      json: { identifier: identifier.trim(), password },
    });
    if (!data.token || !data.user) throw new Error('The server returned an incomplete login response.');
    const u = toUser(data.user);
    if (u.accountStatus && !['active', 'pending'].includes(u.accountStatus)) throw new Error(`Account status: ${u.accountStatus}. Contact the PASS administrator.`);
    if (requiresPublicEmailVerification(u)) throw new Error('Verify your email address before accessing the mobile dashboard.');
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(u);
  }, []);

  // Verified pending applicants may sign in to view their status, not access protected modules.
  // Refreshing /me lets the mobile app pick up an Administrator's later decision.
  const refreshUser = useCallback(async () => {
    if (!token) return;
    const data = await api<{ user: any }>('/me', { token });
    const updated = toUser(data.user);
    if (requiresPublicEmailVerification(updated) || !['active', 'pending'].includes(updated.accountStatus ?? '')) {
      throw new Error('This account is not currently eligible for access. Contact the PASS office.');
    }
    setUser(updated);
  }, [token]);

  const finishAccountSetup = useCallback(async (normalToken: string) => {
    // Verify the fully activated Sanctum token before replacing the restricted setup session.
    const result = await api<{ user: any }>('/me', { token: normalToken });
    const updated = toUser(result.user);
    if (updated.accountSetup?.required || updated.accountStatus !== 'active' || updated.emailVerified === false) {
      throw new Error('PASS has not fully activated this account. Please contact the administrator.');
    }
    await SecureStore.setItemAsync(TOKEN_KEY, normalToken);
    setToken(normalToken);
    setUser(updated);
  }, []);

  // Browsing-only guest session. Never represent locally stored data as server-approved access.
  const continueAsGuest = useCallback(() => {
    setToken(null);
    setUser({ id: 'guest', name: 'Guest User', role: 'guest', email: '' });
  }, []);

  const logout = useCallback(async () => {
    const t = token;
    setUser(null);
    setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    if (t) await api('/logout', { method: 'POST', token: t }).catch(() => {});
  }, [token]);

  return <Ctx.Provider value={{ user, token, restoring, login, continueAsGuest, refreshUser, finishAccountSetup, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);

  if (!c) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return c;
}