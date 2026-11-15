import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Btn, Card, T } from './ui';
import { C } from '../theme';
export function AdminTabs<T extends string>({ options, value, onChange, disabled = false }: {
    options: readonly {
        value: T;
        label: string;
    }[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
}) {
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected: option.value === value, disabled }} disabled={disabled} onPress={() => onChange(option.value)} style={{ minHeight: 44, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 12, backgroundColor: option.value === value ? C.navy : C.white, borderWidth: 1, borderColor: C.slate200 }}><T s={12} w="semibold" c={option.value === value ? C.white : C.navy}>{option.label}</T></Pressable>)}</View>;
}
export function AdminNotice({ error, message }: {
    error?: string;
    message?: string;
}) {
    if (!error && !message)
        return null;
    return <Card bg={error ? C.red50 : C.green50} border={error ? C.red200 : C.green200}><T accessibilityRole={error ? 'alert' : 'text'} accessibilityLiveRegion="polite" s={13} c={error ? C.red700 : C.green700}>{error || message}</T></Card>;
}
export function AdminLoading({ loading, error, retry }: {
    loading: boolean;
    error: string;
    retry: () => void;
}) {
    if (error)
        return <Card style={{ gap: 12 }}><T accessibilityRole="alert" s={13} c={C.red700}>{error}</T><Btn label="Retry loading" onPress={retry}/></Card>;
    if (loading)
        return <View style={{ padding: 20, alignItems: 'center', gap: 10 }}><ActivityIndicator color={C.royal}/><T s={13}>Loading PASS records…</T></View>;
    return null;
}
export function AdminInfo({ label, value }: {
    label: string;
    value: unknown;
}) {
    return <View style={{ gap: 3 }}><T s={11} c={C.slate500}>{label}</T><T s={13} c={C.navy} style={{ flexShrink: 1 }}>{value === null || value === undefined || value === '' ? '—' : String(value)}</T></View>;
}
export function AdminCheckbox({ label, checked, onChange, disabled = false }: {
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)} style={{ minHeight: 44, paddingVertical: 10, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}><T s={17} w="bold" c={C.royal}>{checked ? '☑' : '☐'}</T><T s={13} style={{ flex: 1 }}>{label}</T></Pressable>;
}
export function AdminPager({ page, last, total, disabled, onChange, label }: {
    page: number;
    last: number;
    total: number;
    disabled: boolean;
    onChange: (page: number) => void;
    label?: string;
}) {
    return <View style={{ gap: 10 }}><T s={12} c={C.slate500}>{total} {label || (total === 1 ? 'record' : 'records')} · Page {page} of {Math.max(1, last)}</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><Btn label={label ? `Previous ${label} page` : 'Previous page'} py={12} disabled={disabled || page <= 1} onPress={() => onChange(page - 1)} bg={C.blue50} color={C.royal} style={{ flexGrow: 1 }}/><Btn label={label ? `Next ${label} page` : 'Next page'} py={12} disabled={disabled || page >= last} onPress={() => onChange(page + 1)} style={{ flexGrow: 1 }}/></View></View>;
}
export function AdminDialog({ title, children, onClose, busy = false }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    busy?: boolean;
}) {
    return <Modal transparent animationType="fade" onRequestClose={() => { if (!busy)
        onClose(); }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 16 }}><View accessibilityViewIsModal style={{ width: '100%', maxWidth: 600, maxHeight: '90%', alignSelf: 'center', backgroundColor: C.white, borderRadius: 20 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}><T accessibilityRole="header" s={20} w="head" c={C.navy}>{title}</T>{children}<Btn label="Close dialog" disabled={busy} onPress={onClose} bg={C.blue50} color={C.royal} py={12}/></ScrollView></View></KeyboardAvoidingView></Modal>;
}
export function AdminDenied({ back }: {
    back: () => void;
}) {
    return <View style={{ padding: 24, gap: 14 }}><T s={18} w="bold">Administrator access required</T><T s={13}>This workspace is available to active administrators.</T><Btn label="Back to workspace" onPress={back}/></View>;
}
