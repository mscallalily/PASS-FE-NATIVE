import { api } from '../api/client';
import type { MobileRole } from '../context/AuthContext';
import type { MobileScreen } from '../screens/shared';
import type { ModuleKey } from '../permissions';
import { canAccessModule } from '../permissions';

/** Actual fields returned by Laravel's authenticated /notifications endpoint. */
export interface PassNotification {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  related_type: string | null;
  related_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationResponse {
  data: PassNotification[];
  unread_count: number;
}

export const notificationApi = {
  list: (token: string) => api<NotificationResponse>('/notifications', { token }),
  count: (token: string) => api<{ unread_count: number }>('/notifications/unread-count', { token }),
  read: (token: string, id: number) => api(`/notifications/${id}/read`, { token, method: 'PATCH' }),
  readAll: (token: string) => api('/notifications/read-all', { token, method: 'POST' }),
};

export type NotificationCategory = 'parking' | 'security' | 'account' | 'general';
export type NotificationTone = 'warning' | 'success' | 'information';

export function notificationCategory(notification: PassNotification): NotificationCategory {
  const type = (notification.notification_type ?? '').toLowerCase();
  const related = (notification.related_type ?? '').toLowerCase();
  if (/violation|access|gate|incident|security|denied/.test(`${type} ${related}`)) return 'security';
  if (/license|account|approval|vehicle_auth|registration|user|rfid/.test(`${type} ${related}`)) return 'account';
  if (/parking|slot|area|space|vehicle/.test(`${type} ${related}`)) return 'parking';
  return 'general';
}

export function notificationTone(notification: PassNotification): NotificationTone {
  const type = (notification.notification_type ?? '').toLowerCase();
  if (/denied|reject|violation|full|suspend|fail|invalid|incident|wrong/.test(type)) return 'warning';
  if (/approved|verified|success|resolved|completed|granted/.test(type)) return 'success';
  return 'information';
}

/** Parses the ISO timestamps emitted by Laravel without exposing raw database strings. */
export function notificationTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  const delta = Math.max(0, now.getTime() - date.getTime());
  if (delta < 60000) return 'Just now';
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export function notificationGroup(iso: string, now = new Date()): 'Today' | 'Yesterday' | 'Earlier' {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Earlier';
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const stampedMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (stampedMidnight === midnight) return 'Today';
  if (stampedMidnight === new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()) return 'Yesterday';
  return 'Earlier';
}

export type NotificationDestination = { screen: MobileScreen; label: string } | { module: ModuleKey; label: string };

/** Only offer links to screens the current role can actually open. */
export function notificationDestination(n: PassNotification, role: MobileRole): NotificationDestination | null {
  const type = (n.notification_type ?? '').toLowerCase();
  const related = (n.related_type ?? '').toLowerCase();
  const payloadScreen = typeof n.payload?.screen === 'string' ? n.payload.screen.toLowerCase() : '';
  const regular = ['student', 'faculty', 'employee'].includes(role ?? '');

  // A violation/access alert takes priority even if an unrelated payload or stale
  // related_type still names a license. Never deep-link a student to staff-only data.
  if (/violation/.test(`${type} ${related}`) && canAccessModule(role, 'violations'))
    return { module: 'violations', label: 'View violations' };
  if (/violation/.test(`${type} ${related}`)) return null;
  if (/access_event|access_denied|gate/.test(`${type} ${related}`) && canAccessModule(role, 'access-events'))
    return { module: 'access-events', label: 'View access records' };
  if (/access_event|access_denied|gate/.test(`${type} ${related}`)) return null;
  if ((type.startsWith('license_') || /driverlicense/.test(related) || payloadScreen === 'driver_license') && regular)
    return { screen: 'license', label: 'Review license' };
  if (/visitor|qr_pass/.test(`${type} ${related}`)) {
    if (role === 'guest') return { screen: 'guest-request', label: 'View visitor request' };
    if (canAccessModule(role, 'visitors')) return { module: 'visitors', label: 'View visitor requests' };
  }
  if (/vehicle_auth/.test(`${type} ${related}`) && regular) return { screen: 'vehicles', label: 'My vehicles' };
  if (/parking|slot|area|space/.test(`${type} ${related}`)) return { screen: 'parking', label: 'View parking' };
  return null;
}
