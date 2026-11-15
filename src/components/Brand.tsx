import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { BRAND } from '../config';
import { C, F } from '../theme';

const PASS_LOGO = require('../../assets/branding/pass-logo.jpg');

/** Official PASS logo, shown with its original proportions (square asset). Sizes follow the original w-36 / w-28 / w-24. */
export function PassMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const dim = size === 'xl' ? 144 : size === 'lg' ? 112 : size === 'sm' ? 48 : 96;
  return (
    <Image
      source={PASS_LOGO}
      accessibilityLabel="PASS — Parking Access and Space Management System"
      style={{ width: dim, height: dim, borderRadius: 6 }}
      resizeMode="contain"
    />
  );
}

/** Official DYCI logo loaded from dyci.edu.ph (as in the original); falls back to the text "DYCI". */
export function DyciLogo({ onDark = false, height = 24 }: { onDark?: boolean; height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <Text style={{ fontFamily: F.bold, fontSize: 14, letterSpacing: 0.5, color: onDark ? C.white : C.navy }}>{BRAND.institutionShort}</Text>;
  }
  const uri = (onDark ? BRAND.logoWhite : BRAND.logoColor)[0];
  return (
    <View style={{ height }}>
      <Image source={{ uri }} style={{ height, width: height * 3 }} resizeMode="contain" onError={() => setFailed(true)} />
    </View>
  );
}
