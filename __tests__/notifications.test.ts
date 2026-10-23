import {
  notificationCategory, notificationDestination, notificationGroup, notificationTime,
  notificationTone, type PassNotification,
} from '../src/services/notifications';

const item = (patch: Partial<PassNotification> = {}): PassNotification => ({
  notification_id: 9,
  notification_type: 'license_verified',
  title: "Driver's license verified",
  body: 'Your license has been verified.',
  payload: { screen: 'driver_license' },
  related_type: 'App\\Models\\DriverLicense',
  related_id: 2,
  is_read: false,
  read_at: null,
  created_at: '2026-10-18T09:30:00+08:00',
  ...patch,
});

describe('PASS native notification center helpers', () => {
  it('classifies actual Laravel notification types and their severity', () => {
    expect(notificationCategory(item())).toBe('account');
    expect(notificationTone(item())).toBe('success');
    const denied = item({notification_type: 'parking_access_denied', related_type: 'access_event'});
    expect(notificationCategory(denied)).toBe('security');
    expect(notificationTone(denied)).toBe('warning');
  });

  it('links the owner to their license, never to an unauthorized page', () => {
    expect(notificationDestination(item(), 'student')).toEqual({ screen: 'license', label: 'Review license' });
    expect(notificationDestination(item(), 'guest')).toBeNull();
  });

  it('respects module permissions for security alerts', () => {
    const violation = item({notification_type:'wrong_parking_area', related_type:'parking_violation'});
    expect(notificationDestination(violation, 'security')).toEqual({module:'violations', label:'View violations'});
    expect(notificationDestination(violation, 'student')).toBeNull();
  });

  it('produces friendly relative times and day headings', () => {
    const now = new Date('2026-10-18T10:00:00+08:00');
    expect(notificationTime('2026-10-18T09:57:00+08:00', now)).toBe('3m ago');
    expect(notificationGroup('2026-10-18T09:00:00+08:00', now)).toBe('Today');
    expect(notificationGroup('2026-10-17T09:00:00+08:00', now)).toBe('Yesterday');
    expect(notificationGroup('invalid', now)).toBe('Earlier');
  });
});
