import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { T } from './ui';
import { C } from '../theme';

/**
 * Retrieve evidence only after the reviewer requests it. A bearer token is
 * required and the decoded image remains in component memory (not the gallery
 * or public device storage). Laravel alone decides who may see each document.
 */
export default function PrivateDocumentPreview({ path, label }: { path: string; label: string }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [uri, setUri] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !token) { setUri(''); return; }
    const abort = new AbortController();
    let alive = true;
    setLoading(true);setError('');setUri('');
    (async () => {
      try {
        const response = await fetch(`${API_URL}/api${path}`, {
          headers: { Accept: 'image/jpeg,image/png,application/pdf', Authorization: `Bearer ${token}` }, signal: abort.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(()=>({}));
          throw new Error(payload.message || `The server denied the document (${response.status}).`);
        }
        const blob = await response.blob();
        const mime = (response.headers.get('content-type') ?? blob.type).split(';')[0].toLowerCase();
        if (!/^image\/(jpeg|png)$/.test(mime)) {
          throw new Error(mime === 'application/pdf'
            ? 'This document is a PDF. Use the authorized web review to inspect every page before making a staff decision.'
            : 'This document format cannot be displayed securely on this device.');
        }
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read the private image.'));
          reader.readAsDataURL(blob);
        });
        if (alive) setUri(image);
      } catch(e) {
        if (alive && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not retrieve the private document.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive=false;abort.abort();setUri(''); };
  },[open,path,token]);
  return <View style={{gap:8}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${open?'Close':'Inspect'} ${label}`} onPress={()=>setOpen(v=>!v)}
      style={{padding:11,backgroundColor:C.blue50,borderColor:C.blue100,borderWidth:1,borderRadius:10}}>
      <T s={13} w="semibold" c={C.royal}>{open?'Close document':`Inspect original ${label}`}</T>
    </Pressable>
    {open && <View style={{gap:7}}>
      {loading && <ActivityIndicator color={C.royal}/>}
      {!!error && <T s={12} c={C.red700}>{error}</T>}
      {!!uri && <Image source={{uri}} resizeMode="contain" style={{height:255,width:'100%',backgroundColor:C.slate100,borderRadius:9}} />}
      <T s={11} c={C.slate500}>Private evidence is supplied by Laravel and is not saved to your photo library. Review the entire original document, not OCR text alone.</T>
    </View>}
  </View>;
}
