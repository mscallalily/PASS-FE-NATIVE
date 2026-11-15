import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, withAlpha } from '../theme';

export type MobileScreen =
  | 'release' | 'modules' | 'module-detail' | 'home' | 'parking' | 'history' | 'notifications' | 'profile' | 'qr' | 'guest-request' | 'license' | 'access-records' | 'vehicles';

/** Navy header block that extends under the status bar (the original's px-5 pt-8 pb-10/12 header). */
export function NavyHeader({ children, pb = 40 }: { children: React.ReactNode; pb?: number }) {
  const insets = useSafeAreaInsets();
  return <LinearGradient colors={[C.navy, C.navy, C.royalDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: insets.top + 28, paddingBottom: pb, overflow: 'hidden' }}>
    <View pointerEvents="none" style={{ position: 'absolute', width: 235, height: 235, borderRadius: 118, right: -110, top: -85, backgroundColor: withAlpha(C.sky, 0.09), borderWidth: 1, borderColor: withAlpha(C.white, 0.08) }} />
    <View pointerEvents="none" style={{ position: 'absolute', width: 170, height: 170, borderRadius: 85, right: 16, bottom: -130, backgroundColor: withAlpha(C.sky, 0.065) }} />
    {children}
  </LinearGradient>;
}
