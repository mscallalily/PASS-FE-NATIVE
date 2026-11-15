import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, AppState, Modal, Pressable, ScrollView, TextInput, View,
} from 'react-native';
import {
  AlertCircle, ArrowRight, Bell, BellRing, Check, CheckCheck, ChevronRight, Clock3,
  FileCheck2, Inbox, LockKeyhole, ParkingSquare, RefreshCw, Search, ShieldAlert, X,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Card, Frame, T } from '../components/ui';
import { C, F, withAlpha } from '../theme';
import { NavyHeader, type MobileScreen } from './shared';
import type { ModuleKey } from '../permissions';
import {
  notificationApi, notificationCategory, notificationDestination, notificationGroup,
  notificationTime, notificationTone, type PassNotification,
} from '../services/notifications';

const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' },
  { key: 'parking', label: 'Parking' }, { key: 'security', label: 'Security' },
  { key: 'account', label: 'Account' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const appearance = (item: PassNotification) => {
  const category = notificationCategory(item);
  const tone = notificationTone(item);
  if (tone === 'warning') return { Icon: category === 'security' ? ShieldAlert : AlertCircle, color: C.red600, bg: C.red50, tag: 'Needs attention' };
  if (tone === 'success') return { Icon: FileCheck2, color: C.green700, bg: C.green50, tag: 'Update' };
  if (category === 'parking') return { Icon: ParkingSquare, color: C.royal, bg: C.blue50, tag: 'Parking' };
  if (category === 'security') return { Icon: LockKeyhole, color: C.royal, bg: C.blue50, tag: 'Security' };
  if (category === 'account') return { Icon: FileCheck2, color: C.royal, bg: C.blue50, tag: 'Account' };
  return { Icon: Bell, color: C.royal, bg: C.blue50, tag: 'Announcement' };
};

function NotificationCard({ item, onPress, busy }: { item: PassNotification; onPress: () => void; busy: boolean }) {
  const { Icon, color, bg, tag } = appearance(item);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${item.is_read ? 'Read' : 'Unread'}: ${item.title}. ${item.body}`}
      accessibilityHint="Opens notification details"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }], opacity: busy ? 0.7 : pressed ? 0.9 : 1 })}
    >
      <Card border={item.is_read ? C.slate100 : C.blue200} style={{ padding: 0, overflow: 'hidden', borderRadius: 20, shadowOpacity: item.is_read ? 0.035 : 0.085, elevation: item.is_read ? 1 : 3 }}>
        <View style={{ flexDirection: 'row' }}>
          {!item.is_read && <View style={{ width: 3, backgroundColor: C.royal }} />}
          <View style={{ flex: 1, padding: 16, gap: 11 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon color={color} size={21} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <T s={10} w="semibold" c={color} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{tag}</T>
                  <T s={11} c={C.slate500}>{notificationTime(item.created_at)}</T>
                </View>
                <T s={15} w={item.is_read ? 'semibold' : 'bold'} c={C.navy} style={{ lineHeight: 21 }}>{item.title}</T>
                <T s={13} c={C.slate600} numberOfLines={2} style={{ lineHeight: 19 }}>{item.body}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 58 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.is_read ? C.slate300 : C.royal }} />
                <T s={11} w="medium" c={item.is_read ? C.slate500 : C.royal}>{item.is_read ? 'Read' : 'New · Tap to view'}</T>
              </View>
              <ChevronRight size={16} color={C.slate400} />
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function FilterChip({ label, active, count, onPress }: { label: string; active: boolean; count?: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Show ${label.toLowerCase()} notifications`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 11,
        borderRadius: 14, backgroundColor: active ? C.navy : C.white,
        borderWidth: 1, borderColor: active ? C.navy : C.slate200,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <T s={12} w="semibold" c={active ? C.white : C.slate600}>{label}</T>
      {typeof count === 'number' && count > 0 && (
        <View style={{ minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: active ? withAlpha(C.white, 0.2) : C.blue50, alignItems: 'center', justifyContent: 'center' }}>
          <T s={10} w="bold" c={active ? C.white : C.royal}>{count}</T>
        </View>
      )}
    </Pressable>
  );
}

export function NotificationScreen({
  onNavigate, onOpenModule, onUnreadChange,
}: {
  onNavigate?: (screen: MobileScreen) => void;
  onOpenModule?: (key: ModuleKey) => void;
  onUnreadChange?: (count: number) => void;
}) {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<PassNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PassNotification | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async (pull = false) => {
    if (!token) { setLoading(false); setRefreshing(false); return; }
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await notificationApi.list(token);
      if (!alive.current) return;
      setRows(response.data ?? []);
      setUnreadCount(response.unread_count ?? 0);
      onUnreadChange?.(response.unread_count ?? 0);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Unable to load notifications.');
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  }, [token, onUnreadChange]);

  useEffect(() => {
    alive.current = true;
    void load();
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load(true);
    });
    return () => { alive.current = false; subscription.remove(); };
  }, [load, fade]);

  const markOne = async (item: PassNotification) => {
    if (!token || item.is_read || busyId != null || marking) return;
    setBusyId(item.notification_id);
    setError('');
    try {
      await notificationApi.read(token, item.notification_id);
      if (!alive.current) return;
      setRows(previous => previous.map(n => n.notification_id === item.notification_id ? { ...n, is_read: true } : n));
      setSelected(previous => previous?.notification_id === item.notification_id ? { ...previous, is_read: true } : previous);
      // Another device may have read or received notifications since this list loaded.
      const count = await notificationApi.count(token).then(r => r.unread_count).catch(() => Math.max(0, unreadCount - 1));
      if (!alive.current) return;
      setUnreadCount(count);
      onUnreadChange?.(count);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not mark notification as read.');
    } finally {
      if (alive.current) setBusyId(null);
    }
  };

  const markAll = async () => {
    if (!token || marking || busyId != null || unreadCount === 0) return;
    setMarking(true);
    setError('');
    try {
      await notificationApi.readAll(token);
      if (!alive.current) return;
      setRows(previous => previous.map(n => ({ ...n, is_read: true })));
      setSelected(previous => previous ? { ...previous, is_read: true } : null);
      const count = await notificationApi.count(token).then(r => r.unread_count).catch(() => 0);
      if (!alive.current) return;
      setUnreadCount(count);
      onUnreadChange?.(count);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not mark notifications as read.');
    } finally {
      if (alive.current) setMarking(false);
    }
  };

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return rows.filter(n => {
      if (filter === 'unread' && n.is_read) return false;
      if (filter !== 'unread' && filter !== 'all' && notificationCategory(n) !== filter) return false;
      return !text || `${n.title} ${n.body} ${n.notification_type}`.toLocaleLowerCase().includes(text);
    });
  }, [rows, filter, query]);

  const groups = useMemo(() => (['Today', 'Yesterday', 'Earlier'] as const).map(name => ({
    name, items: filtered.filter(n => notificationGroup(n.created_at) === name),
  })).filter(group => group.items.length > 0), [filtered]);
  const select = (item: PassNotification) => { setSelected(item); void markOne(item); };
  const action = selected ? notificationDestination(selected, user?.role ?? null) : null;
  const go = () => {
    if (!action) return;
    setSelected(null);
    if ('module' in action) onOpenModule?.(action.module);
    else onNavigate?.(action.screen);
  };

  return (
    <>
      <Frame topInset={false} bottomPad={28} refreshing={refreshing} onRefresh={() => void load(true)}>
        <NavyHeader pb={52}>
          <Animated.View style={{ opacity: fade, gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 5 }}>
                <T s={11} w="semibold" c={C.blue200} style={{ letterSpacing: 2 }}>YOUR ACTIVITY CENTER</T>
                <T s={28} w="head" c={C.white}>Notifications</T>
                <T s={13} c={C.blue200} style={{ lineHeight: 19 }}>Important updates, all in one place.</T>
              </View>
              <View style={{ width: 57, height: 57, borderRadius: 19, backgroundColor: withAlpha(C.white, 0.14), borderWidth: 1, borderColor: withAlpha(C.white, 0.25), justifyContent: 'center', alignItems: 'center' }}>
                <BellRing size={27} color={C.white} />
                {unreadCount > 0 && <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 23, height: 23, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.navy }}><T s={10} w="bold" c={C.navy}>{unreadCount > 99 ? '99+' : unreadCount}</T></View>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, backgroundColor: withAlpha(C.white, 0.1), borderWidth: 1, borderColor: withAlpha(C.white, 0.14) }}>
                <Bell size={16} color={C.sky} /><T s={19} w="bold" c={C.white}>{unreadCount}</T><T s={12} c={C.blue200}>Unread</T>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, backgroundColor: withAlpha(C.white, 0.1), borderWidth: 1, borderColor: withAlpha(C.white, 0.14) }}>
                <Inbox size={16} color={C.sky} /><T s={19} w="bold" c={C.white}>{rows.length}</T><T s={12} c={C.blue200}>Recent</T>
              </View>
            </View>
          </Animated.View>
        </NavyHeader>

        <View style={{ paddingHorizontal: 18, marginTop: -26, gap: 19 }}>
          <Card style={{ borderRadius: 21, padding: 13, gap: 12, shadowOpacity: 0.09, shadowRadius: 14, elevation: 4 }}>
            <View style={{ backgroundColor: C.slate50, borderWidth: 1, borderColor: C.slate200, borderRadius: 14, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 13, minHeight: 47 }}>
              <Search size={18} color={C.slate500} />
              <TextInput accessibilityLabel="Search notifications" value={query} onChangeText={setQuery} placeholder="Search your updates..." placeholderTextColor={C.slate400} style={{ flex: 1, fontFamily: F.regular, fontSize: 14, color: C.navy, paddingVertical: 11 }} returnKeyType="search" />
              {query.length > 0 && <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={10}><X size={17} color={C.slate500} /></Pressable>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }} keyboardShouldPersistTaps="always">
              {FILTERS.map(item => <FilterChip key={item.key} label={item.label} active={item.key === filter} count={item.key === 'unread' ? unreadCount : undefined} onPress={() => setFilter(item.key)} />)}
            </ScrollView>
          </Card>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 30 }}>
            <View style={{ gap: 2 }}><T s={17} w="head" c={C.navy}>{filter === 'unread' ? 'Unread updates' : filter === 'all' ? 'Latest updates' : `${FILTERS.find(f => f.key === filter)?.label} updates`}</T><T s={12} c={C.slate500}>{loading && rows.length === 0 ? 'Checking your inbox...' : `${filtered.length} notification${filtered.length !== 1 ? 's' : ''}`}</T></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications as read" disabled={unreadCount === 0 || marking || busyId !== null} onPress={() => void markAll()} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9, opacity: unreadCount === 0 ? 0.45 : pressed ? 0.65 : 1 })}>
              {marking ? <ActivityIndicator size="small" color={C.royal} /> : <CheckCheck size={16} color={C.royal} />}
              <T s={12} w="semibold" c={C.royal}>Read all</T>
            </Pressable>
          </View>

          {!!error && <Card bg={C.red50} border={C.red200} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14 }}>
            <AlertCircle size={19} color={C.red600} /><View style={{ flex: 1 }}><T s={13} w="semibold" c={C.red700}>Something went wrong</T><T s={12} c={C.red700}>{error}</T></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => void load(true)}><RefreshCw color={C.red600} size={20}/></Pressable>
          </Card>}

          {loading && rows.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 45 }}><ActivityIndicator size="large" color={C.royal} /><T s={13} c={C.slate500}>Loading your updates...</T></View>
          ) : groups.length > 0 ? (
            <View style={{ gap: 21 }}>
              {groups.map(group => <View key={group.name} style={{ gap: 11 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Clock3 size={14} color={C.slate400} /><T s={12} w="semibold" c={C.slate500} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{group.name}</T><View style={{ flex: 1, height: 1, backgroundColor: C.slate200 }}/></View>
                {group.items.map(item => <NotificationCard key={item.notification_id} item={item} busy={busyId !== null} onPress={() => select(item)} />)}
              </View>)}
            </View>
          ) : !error ? (
            <Card style={{ padding: 28, alignItems: 'center', gap: 10, borderRadius: 22 }}>
              <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' }}>{filter === 'unread' && !query ? <Check size={32} color={C.royal} /> : query ? <Search size={29} color={C.royal} /> : <Bell size={29} color={C.royal} />}</View>
              <T s={17} w="head" c={C.navy}>{query ? 'No matching updates' : filter === 'unread' ? 'You’re all caught up!' : rows.length === 0 ? 'Your inbox is clear' : 'Nothing in this category'}</T>
              <T s={13} c={C.slate500} style={{ textAlign: 'center', lineHeight: 20 }}>{query ? 'Try a different search or clear your filters.' : filter === 'unread' ? 'You have no unread updates right now.' : rows.length === 0 ? 'Updates about your account and campus parking will appear here.' : 'Try another category to view more updates.'}</T>
              {(query || filter !== 'all') && <Pressable onPress={() => { setQuery(''); setFilter('all'); }} style={{ marginTop: 6, paddingVertical: 7, paddingHorizontal: 14 }}><T s={13} w="semibold" c={C.royal}>View all notifications</T></Pressable>}
            </Card>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Refresh notifications" onPress={() => void load(true)} disabled={refreshing} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? <ActivityIndicator size="small" color={C.royal} /> : <RefreshCw size={15} color={C.royal} />}
            <T s={12} w="medium" c={C.royal}>Refresh updates</T>
          </Pressable>
          <T s={11} c={C.slate400} style={{ textAlign: 'center' }}>Showing your 100 most recent server notifications.</T>
        </View>
      </Frame>

      <Modal visible={selected != null} transparent animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: withAlpha(C.black, 0.56), justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setSelected(null)} accessibilityLabel="Dismiss notification details" />
          {selected && (() => {
            const meta = appearance(selected);
            const Icon = meta.Icon;
            const linked = notificationDestination(selected, user?.role ?? null);
            const canOpen = linked && (('module' in linked && !!onOpenModule) || ('screen' in linked && !!onNavigate));
            return <View style={{ backgroundColor: C.white, paddingHorizontal: 23, paddingTop: 15, paddingBottom: 38, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 15 }}>
              <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 9, backgroundColor: C.slate200, marginBottom: 5 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ width: 56, height: 56, borderRadius: 17, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}><Icon size={26} color={meta.color} /></View>
                <Pressable onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel="Close details" style={{ width: 37, height: 37, borderRadius: 12, backgroundColor: C.slate100, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.slate600}/></Pressable>
              </View>
              <T s={11} w="semibold" c={meta.color} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{meta.tag}</T>
              <T s={22} w="head" c={C.navy} style={{ lineHeight: 29 }}>{selected.title}</T>
              <T s={14} c={C.slate600} style={{ lineHeight: 23 }}>{selected.body}</T>
              <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.slate100, paddingTop: 14 }}>
                <Clock3 size={15} color={C.slate400} /><T s={12} c={C.slate500}>{new Date(selected.created_at).toLocaleString()}</T>
                {selected.is_read && <><T s={12} c={C.slate400}>·</T><Check size={13} color={C.green600}/><T s={12} c={C.slate500}>Read</T></>}
              </View>
              {canOpen ? <Pressable accessibilityRole="button" onPress={go} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 15, backgroundColor: C.royal, paddingVertical: 16, opacity: pressed ? 0.85 : 1 })}><T s={15} w="bold" c={C.white}>{linked!.label}</T><ArrowRight size={18} color={C.white}/></Pressable>
                : <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={{ borderRadius: 15, backgroundColor: C.navy, alignItems: 'center', paddingVertical: 16 }}><T s={15} w="bold" c={C.white}>Done</T></Pressable>}
            </View>;
          })()}
        </View>
      </Modal>
    </>
  );
}
