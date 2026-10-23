import { canAccessModule, isStaff, modulesForRole, MODULES } from '../src/permissions';

describe('PASS role separation', () => {
  it('reserves system administration for administrators', () => {
    for (const feature of ['users', 'reports', 'audit', 'settings'] as const) {
      expect(MODULES[feature].roles).toEqual(['admin']);
      expect(canAccessModule('security', feature)).toBe(false);
      expect(canAccessModule('parking_admin', feature)).toBe(false);
      expect(canAccessModule('parking_staff', feature)).toBe(false);
    }
  });

  it('keeps security focused on gate events and incidents', () => {
    expect(modulesForRole('security').sort()).toEqual(['gate', 'qr-verify', 'access-events', 'violations', 'slots'].sort());
    expect(canAccessModule('security', 'licenses-review')).toBe(false);
    expect(canAccessModule('security', 'visitors')).toBe(false);
    expect(canAccessModule('security', 'authorizations')).toBe(false);
  });

  it('removes operational gate access from admin and parking administrator', () => {
    expect(canAccessModule('admin', 'gate')).toBe(false);
    expect(canAccessModule('parking_admin', 'gate')).toBe(false);
    expect(canAccessModule('parking_staff', 'gate')).toBe(true);
    expect(canAccessModule('security', 'gate')).toBe(true);
  });

  it('separates parking authorization reviews from front-line operations', () => {
    expect(canAccessModule('parking_admin', 'authorizations')).toBe(true);
    expect(canAccessModule('parking_staff', 'authorizations')).toBe(false);
    expect(canAccessModule('parking_admin', 'licenses-review')).toBe(true);
    expect(canAccessModule('parking_staff', 'licenses-review')).toBe(false);
  });

  it('restricts emergency release staff review to web-authorized roles', () => {
    expect(canAccessModule('admin','vehicle-releases')).toBe(true);
    expect(canAccessModule('parking_staff','vehicle-releases')).toBe(true);
    expect(canAccessModule('security','vehicle-releases')).toBe(false);
    expect(canAccessModule('parking_admin','vehicle-releases')).toBe(false);
    expect(MODULES['vehicle-releases'].endpoint).toBe('/vehicle-releases');
  });

  it('keeps regular campus users outside management screens', () => {
    for (const role of ['student','faculty','employee'] as const) {
      expect(isStaff(role)).toBe(false);
      expect(modulesForRole(role)).toEqual(['my-vehicles']);
    }
    expect(modulesForRole('guest')).toEqual([]);
  });
});
