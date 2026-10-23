import { getParkingAvailability, type ParkingArea } from '../services/parking';
import { getParkingHistory, type ParkingHistoryItem } from '../services/history';
import { getAccessRecords, type AccessEvent } from '../services/accessRecords';
import { api } from '../api/client';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Activity, Bell, Car, ChevronRight, ClipboardList, Clock, IdCard, Info, MapPin, ParkingSquare, QrCode, RefreshCw, User } from 'lucide-react-native';
import { Card, Frame, T, txt } from '../components/ui';
import { MobileUser, useAuth } from '../context/AuthContext';
import { LICENSE_STATUS_LABEL, useLicense } from '../context/LicenseContext';

import { C, withAlpha } from '../theme';
import { MobileScreen, NavyHeader } from './shared';
export { default as ParkingScreen } from './ParkingMapScreen';

const freeColor = (free: number) => (free < 5 ? C.red500 : free < 15 ? C.amber500 : C.green500);

function useLiveParking() {
  const { token, user } = useAuth();
  const [areas, setAreas] = useState<ParkingArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    if (!token || user?.role === 'guest') {
      setAreas([]);
      setError('Sign in with an authorized PASS account to view live parking availability.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError('');

    getParkingAvailability(token)
      .then((result) => {
        if (active) { setAreas(result); setUpdatedAt(new Date()); }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load parking availability.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, user?.role, revision]);

  const zones = areas.flatMap((area) =>
    (area.zones ?? []).map((zone) => ({
      ...zone,
      displayName: zone.zone_name || zone.zone_code,
    })),
  );

  return {
    zones: zones.length ? zones : areas.map(area => ({zone_id: area.parking_area_id, displayName: area.area_name, available: area.available, capacity: area.capacity, occupied: area.occupied, reserved: 0})),
    loading,
    error,
    totalCapacity: areas.reduce((sum, area) => sum + area.capacity, 0),
    totalAvailable: areas.reduce((sum, area) => sum + area.available, 0),
    updatedAt,
    refresh: () => setRevision(value => value + 1),
  };
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function ZoneBar({
  free,
  capacity,
  height,
}: {
  free: number;
  capacity: number;
  height: number;
}) {
  const percentage =
    capacity > 0 ? Math.max(0, Math.min(100, (free / capacity) * 100)) : 0;

  return (
    <View
      style={{
        flex: 1,
        height,
        backgroundColor: C.slate100,
        borderRadius: 99,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${percentage}%`,
          backgroundColor: freeColor(free),
          borderRadius: 99,
        }}
      />
    </View>
  );
}

export function HomeScreen({ user, onNavigate, unreadCount = 0 }: { user: MobileUser; onNavigate: (s: MobileScreen) => void; unreadCount?: number }) {
  const { status: licenseStatus } = useLicense();
  const { token } = useAuth();
  const [session, setSession] = useState<any[]>([]);
  const [recent, setRecent] = useState<ParkingHistoryItem[]>([]);
  useEffect(() => {
    if (!token || !['student','faculty','employee'].includes(user.role ?? '')) return;
    api<{data:any[]}>('/parking/my-session', {token}).then(r => setSession(r.data ?? [])).catch(() => {});
    getParkingHistory(token).then(h => setRecent(h.slice(0, 2))).catch(() => {});
  }, [token, user.role]);

  const {
    zones: liveZones,
    loading: parkingLoading,
    error: parkingError,
    totalAvailable: liveTotalAvailable,
  } = useLiveParking();

  /* ---- Guest ---- */
  if (user.role === 'guest') {
    return (
      <Frame topInset={false} bottomPad={96}>
        <NavyHeader>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <View>
              <T s={14} c={C.blue300}>Welcome, Guest!</T>
              <T s={20} w="head" c={C.white}>{user.name}</T>
            </View>
            <View style={{ backgroundColor: withAlpha(C.amber400, 0.2), borderColor: withAlpha(C.amber400, 0.3), borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 }}>
              <T s={12} c={C.amber300}>Guest</T>
            </View>
          </View>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Info size={18} color={C.sky} />
            <T s={12} c={C.blue200} style={{ flex: 1, lineHeight: 19.5 }}>Submit a visitor parking request with your visit purpose and vehicle details. A QR pass is available only after approval.</T>
          </View>
        </NavyHeader>
        <View style={{ paddingHorizontal: 20, marginTop: -16, gap: 16 }}>
          <Pressable onPress={() => onNavigate('guest-request')} style={({ pressed }) => ({
            backgroundColor: C.navy, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, transform: [{ scale: pressed ? 0.97 : 1 }],
          })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ClipboardList size={28} color={C.white} />
              <View>
                <T s={16} w="bold" c={C.white}>Visitor Parking Request</T>
                <T s={12} c={C.blue200}>Submit details and check approval</T>
              </View>
            </View>
            <ChevronRight size={20} color={C.white} />
          </Pressable>
          <Pressable onPress={() => onNavigate('parking')} style={({ pressed }) => ({
            backgroundColor: C.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.blue100,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', transform: [{ scale: pressed ? 0.97 : 1 }],
          })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, backgroundColor: C.blue100, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={18} color={C.royal} />
              </View>
              <View>
                <T s={16} w="semibold" c={C.slate700}>Parking Availability</T>
                <T s={12} c={C.slate400}>Sign in to view live slots</T>
              </View>
            </View>
            <ChevronRight size={18} color={C.slate300} />
          </Pressable>
        </View>
      </Frame>
    );
  }

  /* ---- Student / Faculty / Employee ---- */
  const quick = [
    { label: 'Availability', icon: <ParkingSquare size={20} color={C.royal} />, bg: C.blue50, screen: 'parking' as MobileScreen },
    { label: 'History', icon: <Clock size={20} color={C.green600} />, bg: C.green50, screen: 'history' as MobileScreen },
    { label: 'Profile', icon: <User size={20} color={C.purple600} />, bg: C.slate100, screen: 'profile' as MobileScreen },
  ];

  const licIcon =
    licenseStatus === 'verified' ? { bg: C.green100, fg: C.green600 }
    : licenseStatus === 'pending' ? { bg: C.amber100, fg: C.amber600 }
    : licenseStatus === 'rejected' ? { bg: C.red100, fg: C.red600 }
    : { bg: C.blue50, fg: C.royal };

  const totalFree = liveTotalAvailable;

  return (
    <Frame topInset={false} bottomPad={96}>
      <NavyHeader pb={48}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <View>
            <T s={14} c={C.blue300}>{greeting()}</T>
            <T s={20} w="head" c={C.white}>{user.name}</T>
          </View>
          <Pressable onPress={() => onNavigate('notifications')} accessibilityRole="button" accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"} style={{ padding: 11, backgroundColor: withAlpha(C.white, 0.12), borderRadius: 14, borderColor: withAlpha(C.white, 0.2), borderWidth: 1 }}>
            <Bell size={20} color={C.white} />
            {unreadCount > 0 && <View style={{ position: 'absolute', top: -6, right: -6, minWidth: 21, height: 21, borderRadius: 11, backgroundColor: C.sky, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.navy }}><T s={10} w="bold" c={C.navy}>{unreadCount > 99 ? '99+' : unreadCount}</T></View>}
          </Pressable>
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <T s={12} w="medium" c={C.blue200}>Current Status</T>
            <T s={16} w="bold" c={C.white}>{session.length ? 'Currently Parked' : 'Not Parked'}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T s={12} w="medium" c={C.blue200}>Vehicle</T>
            <T s={16} w="semibold" c={C.white}>{session[0]?.plate_number ?? "No active vehicle"}</T>
          </View>
        </View>
      </NavyHeader>

      <View style={{ paddingHorizontal: 16, marginTop: -20, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {quick.map(a => (
            <Pressable key={a.label} onPress={() => onNavigate(a.screen)} style={({ pressed }) => ({
              flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.blue100, borderRadius: 19, paddingVertical: 15, paddingHorizontal: 8, alignItems: 'center', gap: 9, shadowColor: C.navy, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, transform: [{ scale: pressed ? 0.97 : 1 }],
            })}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>{a.icon}</View>
              <T s={12} w="semibold" c={C.navy}>{a.label}</T>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => onNavigate('license')} style={({ pressed }) => ({
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.blue100, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: licIcon.bg, alignItems: 'center', justifyContent: 'center' }}>
            <IdCard size={18} color={licIcon.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <T s={14} w="semibold" c={C.slate700}>Driver's License</T>
            <T s={12} c={C.slate500}>
              {LICENSE_STATUS_LABEL[licenseStatus]}{licenseStatus === 'not_submitted' ? ' — tap to submit' : licenseStatus === 'rejected' ? ' — tap to resubmit' : ''}
            </T>
          </View>
          <ChevronRight size={16} color={C.slate300} />
        </Pressable>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <T s={14} w="semibold" c={C.slate700}>Parking Available</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green500 }} />
              <T s={12} w="semibold" c={C.green600}>{parkingLoading ? 'Loading...' : parkingError ? 'Unavailable' : `${totalFree} slots`}</T>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {parkingLoading && <T s={12} c={C.slate400}>Loading parking availability...</T>}
            {!!parkingError && <T s={12} c={C.red600}>{parkingError}</T>}
            {!parkingLoading && !parkingError && liveZones.length === 0 && (
              <T s={12} c={C.slate400}>No parking zones available.</T>
            )}
            {liveZones.slice(0, 3).map((z) => (
              <View key={z.zone_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <T s={12} w="semibold" c={C.slate400} style={{ width: 48 }}>{z.displayName}</T>
                <ZoneBar free={z.available} capacity={z.capacity} height={8} />
                <T s={12} w="bold" c={C.slate600} style={{ width: 32, textAlign: 'right' }}>{z.available}</T>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <T s={14} w="semibold" c={C.slate700} style={{ marginBottom: 12 }}>Recent Activity</T>
          {recent.map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.slate50 }}>
              <View>
                <T s={14} w="medium" c={C.slate700}>{h.plate_number ?? 'Vehicle'}</T>
                <T s={12} c={C.slate400}>{new Date(h.entry_datetime).toLocaleDateString()} · {h.transaction_status}</T>
              </View>
              <T s={14} w="bold" c={C.royal}>{h.duration_minutes == null ? 'Active' : `${h.duration_minutes} min`}</T>
            </View>
          ))}
          {recent.length === 0 && <T s={12} c={C.slate400}>No recent parking records.</T>}
          <Pressable onPress={() => onNavigate('history')} style={{ marginTop: 8 }}>
            <T s={12} w="semibold" c={C.royal}>View all history →</T>
          </Pressable>
        </Card>
      </View>
    </Frame>
  );
}

function ParkingAvailabilitySummaryScreen() {
  const { zones, loading, error, totalCapacity, totalAvailable, updatedAt, refresh } = useLiveParking();
  const capacity = totalCapacity;
  const free = totalAvailable;
  const filled = capacity > 0 ? Math.max(0, Math.min(100, ((capacity - free) / capacity) * 100)) : 0;

  return (
    <Frame topInset={false} bottomPad={28} refreshing={loading} onRefresh={refresh}>
      <NavyHeader pb={69}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 5 }}>
            <T s={11} w="semibold" c={C.blue200} style={{ letterSpacing: 1.8 }}>CAMPUS PARKING</T>
            <T s={26} w="head" c={C.white}>Space availability</T>
            <T s={13} c={C.blue200}>Find the best place to park.</T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh parking availability" disabled={loading} onPress={refresh} style={({ pressed }) => ({ padding: 13, borderRadius: 15, backgroundColor: withAlpha(C.white, 0.12), borderWidth: 1, borderColor: withAlpha(C.white, 0.2), opacity: pressed || loading ? 0.65 : 1 })}>
            {loading ? <ActivityIndicator size="small" color={C.white} /> : <RefreshCw size={21} color={C.white} />}
          </Pressable>
        </View>
      </NavyHeader>
      <View style={{ marginTop: -43, paddingHorizontal: 18, gap: 19 }}>
        <Card style={{ borderRadius: 23, padding: 21, shadowOpacity: 0.1, shadowRadius: 18, elevation: 4, gap: 15 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T s={12} w="semibold" c={C.slate500} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Available spaces</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: error ? C.red50 : C.green50 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: error ? C.red500 : C.green500 }} />
              <T s={11} w="semibold" c={error ? C.red600 : C.green700}>{error ? 'Unavailable' : loading ? 'Updating' : 'Server updated'}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T s={51} w="head" c={C.navy} style={{ lineHeight: 60 }}>{error || (loading && !updatedAt) ? '—' : free}</T>
            <T s={14} c={C.slate500}>/ {capacity} total spaces</T>
          </View>
          <View style={{ gap: 10 }}>
            <View style={{ height: 10, backgroundColor: C.slate100, borderRadius: 99, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${filled}%`, backgroundColor: C.royal, borderRadius: 99 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T s={12} c={C.slate500}>{error ? 'Status not available' : `${Math.round(filled)}% occupied`}</T>
              <T s={12} w="semibold" c={C.royal}>{error ? '—' : `${free} open`}</T>
            </View>
          </View>
          {updatedAt && <T s={11} c={C.slate400}>Last synced at {updatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</T>}
        </Card>

        <View style={{ gap: 4 }}><T s={18} w="head" c={C.navy}>Parking zones</T><T s={12} c={C.slate500}>Live occupancy by area · Pull down to refresh</T></View>
        {loading && zones.length === 0 && <View style={{ paddingVertical: 20 }}><ActivityIndicator color={C.royal} /></View>}
        {!!error && <Card bg={C.red50} border={C.red200} style={{ gap: 8 }}><T s={13} w="semibold" c={C.red700}>We couldn't load parking status.</T><T s={12} c={C.red700}>{error}</T><Pressable accessibilityRole="button" onPress={refresh}><T s={13} w="semibold" c={C.royal}>Try again →</T></Pressable></Card>}
        {!loading && !error && zones.length === 0 && <Card style={{ alignItems: 'center', paddingVertical: 25, gap: 8 }}><ParkingSquare size={27} color={C.royal} /><T s={14} w="semibold" c={C.navy}>No parking zones available</T><T s={12} c={C.slate500}>Check back when zones have been added to PASS.</T></Card>}
        <View style={{ gap: 11 }}>
          {!error && zones.map(zone => {
            const percent = zone.capacity ? Math.max(0, Math.min(100, Math.round(zone.available / zone.capacity * 100))) : 0;
            return <Card key={zone.zone_id} style={{ padding: 17, borderRadius: 19, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' }}><ParkingSquare size={21} color={C.royal}/></View>
                <View style={{ flex: 1, gap: 3 }}><T s={15} w="semibold" c={C.navy}>{zone.displayName}</T><T s={12} c={C.slate500}>{zone.capacity} spaces total</T></View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}><T s={20} w="bold" c={freeColor(zone.available)}>{zone.available}</T><T s={11} c={C.slate500}>free slots</T></View>
              </View>
              <ZoneBar free={zone.available} capacity={zone.capacity} height={9} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T s={11} c={C.slate500}>{zone.occupied} occupied{zone.reserved > 0 ? ` · ${zone.reserved} reserved` : ''}</T><T s={11} w="semibold" c={freeColor(zone.available)}>{percent}% available</T>
              </View>
            </Card>;
          })}
        </View>
      </View>
    </Frame>
  );
}

export function HistoryScreen() {
  const { token } = useAuth();
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<ParkingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!token) {
        setHistory([]);
        setLoading(false);
        setError('Please sign in to view your parking history.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const result = await getParkingHistory(token);
        if (active) setHistory(result);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load parking history. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [token]);

  const query = q.trim().toLowerCase();
  const rows = history.filter(item => [
    item.ticket_number,
    item.plate_number,
    item.area_name,
    item.zone_name,
    item.zone_code,
    item.slot_code,
    item.transaction_status,
    item.entry_datetime,
    item.exit_datetime,
  ].some(value => String(value ?? '').toLowerCase().includes(query)));

  const formatDate = (value: string | null) => {
    if (!value) return 'Not yet recorded';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  return (
    <Frame bottomPad={28}>
      <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, gap: 6 }}>
        <T s={11} w="semibold" c={C.royal} style={{letterSpacing:1.5}}>YOUR ACTIVITY</T>
        <T s={24} w="head" c={C.navy}>Parking history</T>
        <T s={13} c={C.slate500}>Review your recent campus parking sessions.</T>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by ticket, plate, date, or status..."
          placeholderTextColor={C.slate400}
          style={{
            backgroundColor: C.white,
            borderWidth: 1,
            borderColor: C.blue100,
            borderRadius: 15,
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 14,
            fontFamily: 'Inter_400Regular',
            color: C.slate700,
          }}
        />
      </View>

      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        {loading && <T s={14} c={C.slate400} style={{ textAlign: 'center', paddingVertical: 24 }}>Loading parking history...</T>}

        {!loading && error !== '' && (
          <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.blue100, borderRadius: 12, padding: 16 }}>
            <T s={14} c={C.navy}>{error}</T>
          </View>
        )}

        {!loading && error === '' && rows.length === 0 && (
          <T s={14} c={C.slate400} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {query ? `No parking sessions match "${q}".` : 'No parking history has been recorded for your account yet.'}
          </T>
        )}

        {!loading && error === '' && rows.map(item => (
          <Card key={item.transaction_id} style={{ borderRadius: 18, padding: 17, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <T s={15} w="head" c={C.navy}>{item.ticket_number || `Session #${item.transaction_id}`}</T>
              <T s={12} c={C.slate400}>{(item.transaction_status || 'Unknown').replace(/_/g, ' ')}</T>
            </View>
            <T s={14} c={C.slate700}>Plate: {item.plate_number || 'Not recorded'}</T>
            <T s={13} c={C.slate400}>Location: {[item.area_name, item.zone_name || item.zone_code, item.slot_code].filter(Boolean).join('   ') || 'Not recorded'}</T>
            <T s={13} c={C.slate400}>Entry: {formatDate(item.entry_datetime)}</T>
            <T s={13} c={C.slate400}>Exit: {formatDate(item.exit_datetime)}</T>
            <T s={13} c={C.slate400}>Duration: {item.duration_minutes == null ? 'Not recorded' : `${item.duration_minutes} minutes`}</T>
          </Card>
        ))}
      </View>
    </Frame>
  );
}


export function AccessRecordsScreen() {
  const {token} = useAuth();
  const [rows,setRows] = useState<AccessEvent[]>([]);
  const [error,setError] = useState('');
  const [q,setQ] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(() => {let live = true;if (!token) {setLoading(false);return;} getAccessRecords(token).then(r => {if(live)setRows(r);}).catch(e => {if(live)setError(e.message);}).finally(() => {if(live)setLoading(false);});return () => {live=false;};},[token]);
  return <Frame bottomPad={96}><View style={{padding:20,gap:12}}><T s={20} w="head" c={C.navy}>Gate Access Records</T><TextInput value={q} onChangeText={setQ} placeholder="Search plate, gate or result" style={{backgroundColor:C.white,padding:14,borderRadius:10,color:C.navy}}/>{loading && <ActivityIndicator />}{!!error && <T s={13} c={C.red600}>{error}</T>}{rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q.toLowerCase())).map(r=><Card key={r.event_id}><T s={14} w="bold" c={C.navy}>{r.plate_number ?? 'Unidentified vehicle'} · {r.auth_result}</T><T s={12}>{r.direction} · {r.access_method} · {r.gate_name ?? 'Gate'}</T><T s={12}>{r.event_datetime}</T>{!!r.denial_reason && <T s={12} c={C.red600}>{r.denial_reason}</T>}</Card>)}</View></Frame>;
}

// The complete notification center lives in its own native screen.
export { NotificationScreen } from './NotificationScreen';
