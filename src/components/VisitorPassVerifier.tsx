import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine, X } from 'lucide-react-native';
import { Btn, Card, Field, T } from './ui';
import { C } from '../theme';
import { verifyVisitorPass, type VerifiedVisitorPass } from '../services/visitorPass';

export default function VisitorPassVerifier({ token }: { token: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const scanHandled = useRef(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerifiedVisitorPass | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async (rawCode: string) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      setResult(await verifyVisitorPass(token, rawCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to verify this visitor pass.');
    } finally {
      setBusy(false);
    }
  };

  const openCamera = async () => {
    setError('');
    try {
      const access = permission?.granted ? permission : await requestPermission();
      if (!access.granted) {
        setError('Camera permission is required to scan a QR pass. You can still enter the pass code manually below.');
        return;
      }
      scanHandled.current = false;
      setScannerOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open the camera. Enter the code manually below.');
    }
  };

  const scanned = ({ data }: { data: string }) => {
    // QR readers may emit the same frame multiple times. Never send duplicate lookups.
    if (scanHandled.current || busy) return;
    scanHandled.current = true;
    setScannerOpen(false);
    setCode(data.trim());
    void verify(data);
  };

  return <>
    <Card style={{ gap: 12 }}>
      <T s={14} w="semibold" c={C.navy}>Scan a visitor QR pass</T>
      <T s={12} c={C.slate500}>Use your device camera to check a server-issued PASS visitor code.</T>
      <Btn label="Scan QR code" bg={C.navy} disabled={busy} icon={<ScanLine color={C.white} size={18} />} onPress={() => void openCamera()} />
      <T s={12} c={C.slate500}>Or enter the QR pass code manually</T>
      <Field label="Visitor QR pass code" accessibilityLabel="Visitor QR pass code" value={code} onChangeText={value => {setCode(value);setResult(null);setError('');}}
        autoCapitalize="none" autoCorrect={false} maxLength={64} editable={!busy} />
      <Btn label="Look up pass" loading={busy} disabled={!code.trim()} onPress={() => void verify(code)} />
      {!!error && <T s={12} c={C.red600}>{error}</T>}
      {!!result && <Card bg={result.entry_allowed ? C.green50 : C.amber50}
        border={result.entry_allowed ? C.green200 : C.amber200} style={{ gap: 7 }}>
        <T s={15} w="bold" c={result.entry_allowed ? C.green700 : C.amber800}>
          {result.entry_allowed ? 'Valid for entry' : result.inside ? 'Visitor vehicle is already inside' : 'Not valid for entry'}
        </T>
        {!!result.entry_problem && <T s={12} c={C.red700}>{result.entry_problem}</T>}
        <T s={12}>Status: {result.status}</T>
        <T s={12}>Visitor: {result.visitor_name ?? '—'}</T>
        <T s={12}>Plate: {result.plate_number ?? '—'}</T>
        <T s={12}>Vehicle type: {result.vehicle_type ?? '—'}</T>
        <T s={12}>Valid: {result.valid_from ?? '—'} to {result.valid_until ?? '—'}</T>
        {!!result.inside && <T s={12}>Parked in: {result.inside.slot_code ?? 'Slot not recorded'}</T>}
        <T s={11} c={C.slate500}>Verification only. Gate entry and exit are recorded separately by authorized personnel.</T>
      </Card>}
    </Card>

    <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
      <View style={{ flex: 1, backgroundColor: C.navy, padding: 20, paddingTop: 48, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T s={20} w="head" c={C.white}>Scan Visitor QR</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Close QR scanner" onPress={() => setScannerOpen(false)}
            style={{ padding: 10 }}><X color={C.white} size={22} /></Pressable>
        </View>
        <T s={13} c={C.blue200}>Point your camera at the QR code shown on the visitor's PASS app.</T>
        {scannerOpen && permission?.granted ? <CameraView
          style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }} facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanHandled.current ? undefined : scanned}
          onMountError={e => {setScannerOpen(false);setError(e.message || 'Camera unavailable. Enter the code manually.');}}
        /> : <ActivityIndicator color={C.white} />}
        <Btn label="Cancel scanning" bg={C.slate600} onPress={() => setScannerOpen(false)} />
      </View>
    </Modal>
  </>;
}
