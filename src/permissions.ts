/** Shared mobile navigation policy. Laravel enforces the matching API permissions. */
import type { MobileRole } from './context/AuthContext';
export type ModuleKey = 'users' | 'authorizations' | 'licenses-review' | 'rfid' | 'rfid-inventory' | 'records' | 'transactions' | 'access-events' | 'slots' | 'visitors' | 'passes' | 'qr-verify' | 'gate' | 'violations' | 'audit' | 'settings' | 'reports' | 'my-vehicles' | 'vehicle-releases';
export type GroupKey = 'administration' | 'reviews' | 'operations' | 'security' | 'monitoring';
type Role = Exclude<MobileRole, null>;
export type ModuleSpec = {
    title: string;
    endpoint?: string;
    roles: readonly Role[];
    group: GroupKey;
    description: string;
};
const admin = ['admin', 'parking_admin'] as const;
const managers = ['admin', 'parking_admin', 'parking_staff', 'security'] as const;
const guards = ['parking_staff', 'security'] as const;
const records = managers;
export const MODULES: Record<ModuleKey, ModuleSpec> = {
    'rfid-inventory': {
        title: 'RFID Inventory', endpoint: '/rfid/inventory', roles: admin, group: 'administration', description: 'Register real stickers, confirm hand-over and manage replacements'
    },
    records: {
        title: 'Records & History', endpoint: '/admin/record-archives/users', roles: admin, group: 'administration', description: 'Account and vehicle archives with retained field changes'
    },
    users: {
        title: 'User Accounts', endpoint: '/admin/users', roles: admin, group: 'administration', description: 'Account approvals and access status'
    },
    reports: {
        title: 'Reports & Analytics', endpoint: '/admin/dashboard', roles: admin, group: 'administration', description: 'System-wide performance and activity'
    },
    audit: {
        title: 'Audit Logs', endpoint: '/admin/audit-logs', roles: admin, group: 'monitoring', description: 'Accountable changes and administrator actions'
    },
    settings: {
        title: 'System Settings', endpoint: '/admin/system-settings', roles: admin, group: 'administration', description: 'Institution and application configuration'
    },
    authorizations: {
        title: 'Vehicle Authorizations', endpoint: '/vehicles/authorizations', roles: managers, group: 'reviews', description: 'Automatic OR/CR results, validity and suspension'
    },
    'licenses-review': {
        title: 'License Verification', endpoint: '/licenses', roles: managers, group: 'reviews', description: 'Review submitted driver documents'
    },
    'vehicle-releases': {
        title: 'Emergency Vehicle Release', endpoint: '/vehicle-releases', roles: managers, group: 'operations', description: 'Check owner-authorized substitute drivers and exits'
    },
    rfid: {
        title: 'RFID Credentials', endpoint: '/rfid/assignments', roles: managers, group: 'monitoring', description: 'Live RFID tags, assignments and access monitoring'
    },
    transactions: {
        title: 'Parking Sessions', endpoint: '/parking/transactions', roles: managers, group: 'operations', description: 'Current and completed parking transactions'
    },
    slots: {
        title: 'Parking Map & Slots', endpoint: '/parking/map', roles: ['admin', 'parking_admin', 'parking_staff', 'security'], group: 'operations', description: 'Shared facility layout and role-authorized slot actions'
    },
    visitors: {
        title: 'Visitor Requests', endpoint: '/visitors/requests', roles: managers, group: 'reviews', description: 'File visits; administrators review the evidence'
    },
    passes: {
        title: 'Visitor QR Passes', endpoint: '/visitors/passes', roles: managers, group: 'reviews', description: 'View or revoke issued visitor passes'
    },
    'qr-verify': {
        title: 'Verify Visitor Pass', roles: managers, group: 'security', description: 'Check a visitor pass against the live server'
    },
    gate: {
        title: 'Gate Entry / Exit', roles: guards, group: 'security', description: 'Validate and record gate movements'
    },
    'access-events': {
        title: 'Access Event Log', endpoint: '/access-events', roles: managers, group: 'monitoring', description: 'Review access grants and denied attempts'
    },
    violations: {
        title: 'Parking Incidents', endpoint: '/violations', roles: guards, group: 'security', description: 'Monitor and report security incidents'
    },
    'my-vehicles': {
        title: 'My Vehicles', endpoint: '/vehicles/my-authorizations', roles: ['student', 'faculty', 'employee'], group: 'operations', description: 'My vehicle authorization status'
    },
};
export const GROUP_LABELS: Record<GroupKey, string> = {
    administration: 'Administration', reviews: 'Approvals & records', operations: 'Parking operations',
    security: 'Security desk', monitoring: 'Monitoring & history',
};
export const ROLE_LABELS: Record<Role, string> = {
    admin: 'System Administrator', parking_admin: 'Parking Administrator', parking_staff: 'Parking Staff',
    security: 'Security Officer', student: 'Student', faculty: 'Faculty', employee: 'Employee', guest: 'Guest',
};
export const isStaff = (role: MobileRole): boolean => role === 'admin' || role === 'parking_admin' || role === 'parking_staff' || role === 'security';
export const isAdmin = (role: MobileRole): boolean => role === 'admin' || role === 'parking_admin';
export const canManageParking = (role: MobileRole): boolean => role !== null && managers.includes(role as typeof managers[number]);
export const canAccessModule = (role: MobileRole, key: ModuleKey): boolean => role !== null && MODULES[key].roles.includes(role);
export const modulesForRole = (role: MobileRole): ModuleKey[] => (Object.keys(MODULES) as ModuleKey[]).filter(key => canAccessModule(role, key));
export const roleSubtitle = (role: MobileRole): string => {
    switch (role) {
        case 'admin': return 'Governance, accounts and system oversight';
        case 'parking_admin': return 'Authorizations and parking supervision';
        case 'parking_staff': return 'Daily parking and visitor operations';
        case 'security': return 'Gate control and incident monitoring';
        default: return 'Campus access and parking';
    }
};
