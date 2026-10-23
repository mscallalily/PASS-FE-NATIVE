import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, RefreshControl, ActivityIndicator, Platform, TextInputProps,
  StyleProp, ViewStyle, TextStyle, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { FileText, Upload, X } from 'lucide-react-native';
import { C, F } from '../theme';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'head';
const FAMILY: Record<Weight, string> = {
  regular: F.regular, medium: F.medium, semibold: F.semibold, bold: F.bold, head: F.headBold,
};

/** Text style helper: size in px, font weight, colour. */
export const txt = (size: number, weight: Weight = 'regular', color: string = C.slate700): TextStyle => ({
  fontSize: size, fontFamily: FAMILY[weight], color,
});

export function T({ s, w = 'regular', c = C.slate700, style, children, ...rest }: {
  s: number; w?: Weight; c?: string; style?: StyleProp<TextStyle>; children?: React.ReactNode;
} & React.ComponentProps<typeof Text>) {
  return <Text {...rest} style={[txt(s, w, c), style]}>{children}</Text>;
}

/** Equivalent of MobileFrame: full-height scrolling screen with a background colour. */
export function Frame({ bg = C.bg, children, centered = false, bottomPad = 0, topInset = true, refreshing = false, onRefresh }: {
  bg?: string; children: React.ReactNode; centered?: boolean; bottomPad?: number; topInset?: boolean; refreshing?: boolean; onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={[
        { flexGrow: 1, paddingTop: topInset ? insets.top : 0, paddingBottom: bottomPad },
        centered && { justifyContent: 'center' },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.royal} colors={[C.royal]} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, border = C.blue100, bg = C.white }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; border?: string; bg?: string;
}) {
  return (
    <View style={[{
      backgroundColor: bg, borderRadius: 18, borderWidth: 1, borderColor: border, padding: 16,
      shadowColor: C.navy, shadowOpacity: 0.055, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    }, style]}>{children}</View>
  );
}

export function Btn({ label, onPress, disabled, loading, bg = C.royal, color = C.white, radius = 12, py = 16, style, icon, border }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; bg?: string; color?: string;
  radius?: number; py?: number; style?: StyleProp<ViewStyle>; icon?: React.ReactNode; border?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: radius, paddingVertical: py, minHeight: 44, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 8, opacity: off ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
        borderWidth: border ? 1 : 0, borderColor: border,
      }, style]}
    >
      {loading ? <ActivityIndicator color={color} /> : icon}
      <Text style={txt(16, 'bold', color)}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, right, style, multiline, ...props }: TextInputProps & {
  label?: string; error?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={style}>
      {label ? <Text style={[txt(14, 'medium', C.slate700), { marginBottom: 6 }]}>{label}</Text> : null}
      <View>
        <TextInput
          {...props}
          multiline={multiline}
          placeholderTextColor={C.slate400}
          onFocus={e => { setFocus(true); props.onFocus?.(e); }}
          onBlur={e => { setFocus(false); props.onBlur?.(e); }}
          style={[{
            backgroundColor: C.white, borderWidth: focus ? 2 : 1,
            borderColor: error ? '#F87171' : focus ? C.royal : C.slate200,
            borderRadius: 12, paddingHorizontal: focus ? 15 : 16, paddingVertical: multiline ? 12 : 14,
            fontSize: 14, fontFamily: F.regular, color: C.slate700, paddingRight: right ? 48 : 16,
            textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 84 : undefined,
          }]}
        />
        {right ? <View style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}>{right}</View> : null}
      </View>
      {error ? <Text style={[txt(12, 'regular', C.red500), { marginTop: 4 }]}>{error}</Text> : null}
    </View>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.red50, borderColor: C.red200, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, marginBottom: 20 }}>
      <Text style={[txt(14, 'regular', C.red700), { flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** A picked document (image or PDF) ready to be appended to FormData. */
export interface PickedFile { uri: string; name: string; type: string; size: number }

export const MAX_FILE_MB = 5;
const ALLOWED = ['image/png', 'image/jpeg', 'application/pdf'];

export function validateFile(f: PickedFile): string | null {
  if (!ALLOWED.includes(f.type)) return 'Upload a JPG, PNG or PDF file';
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `File must be ${MAX_FILE_MB} MB or smaller`;
  return null;
}

/** Shared upload field (school ID, driver's license): photo library, camera, or PDF. */
export function FileUpload({ label, file, error, onChange, onError }: {
  label: string; file: PickedFile | null; error?: string;
  onChange: (f: PickedFile | null) => void; onError: (m: string) => void;
}) {
  const accept = (f: PickedFile) => {
    const problem = validateFile(f);
    if (problem) onError(problem);
    else onChange(f);
  };

  const fromAsset = (a: ImagePicker.ImagePickerAsset): PickedFile => {
    const ext = (a.mimeType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
    return {
      uri: a.uri,
      name: a.fileName ?? `upload-${Date.now()}.${ext}`,
      type: a.mimeType ?? 'image/jpeg',
      size: a.fileSize ?? 0,
    };
  };

  const library = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled && r.assets[0]) accept(fromAsset(r.assets[0]));
  };
  const camera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { onError('Camera permission is required to take a photo'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!r.canceled && r.assets[0]) accept(fromAsset(r.assets[0]));
  };
  const pdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ALLOWED, copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    accept({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/pdf', size: a.size ?? 0 });
  };

  const choose = () => {
    if (Platform.OS === 'web') { library(); return; }
    Alert.alert(label, 'Choose how to add your document', [
      { text: 'Take Photo', onPress: camera },
      { text: 'Photo Library', onPress: library },
      { text: 'PDF / File', onPress: pdf },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View>
      <Text style={[txt(14, 'medium', C.slate700), { marginBottom: 6 }]}>{label}</Text>
      {file ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.green200, backgroundColor: C.green50, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
          <FileText size={18} color={C.green600} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={txt(14, 'medium', C.slate700)}>{file.name}</Text>
            <Text style={txt(12, 'regular', C.slate400)}>{(file.size / 1024).toFixed(0)} KB</Text>
          </View>
          <Pressable onPress={() => onChange(null)} accessibilityLabel="Remove file" hitSlop={10}><X size={16} color={C.slate400} /></Pressable>
        </View>
      ) : (
        <Pressable onPress={choose} style={{ alignItems: 'center', gap: 6, borderWidth: 2, borderStyle: 'dashed', borderColor: error ? C.red400 : C.slate300, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 24 }}>
          <Upload size={20} color={C.slate500} />
          <Text style={txt(14, 'medium', C.slate500)}>Tap to upload</Text>
          <Text style={txt(12, 'regular', C.slate400)}>JPG, PNG or PDF · up to {MAX_FILE_MB} MB</Text>
        </Pressable>
      )}
      {error ? <Text style={[txt(12, 'regular', C.red500), { marginTop: 4 }]}>{error}</Text> : null}
    </View>
  );
}
