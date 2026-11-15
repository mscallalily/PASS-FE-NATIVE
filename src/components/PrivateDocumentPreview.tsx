import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { apiBlob } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { T } from './ui';
import { C } from '../theme';
/** Authenticated evidence remains in memory; it is never saved to the gallery. */
export default function PrivateDocumentPreview({ path, label, onInspected }: {
    path: string;
    label: string;
    onInspected?: (ready: boolean) => void;
}) {
    const { token } = useAuth();
    const [open, setOpen] = useState(false), [image, setImage] = useState<{
        uri: string;
        resource: string;
        version: number;
    } | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
    const callback = useRef(onInspected);
    callback.current = onInspected;
    const version = useRef(0), resource = `${token ?? ''}|${path}`, currentResource = useRef(resource);
    currentResource.current = resource;
    useEffect(() => {
        const current = ++version.current;
        callback.current?.(false);
        setImage(null);
        setError('');
        if (!open || !token) {
            setLoading(false);
            return;
        }
        const abort = new AbortController();
        let alive = true;
        setLoading(true);
        (async () => {
            try {
                const blob = await apiBlob(path, {
                    token, headers: {
                        Accept: 'image/jpeg,image/png,application/pdf'
                    }, signal: abort.signal
                });
                if (!/^image\/(jpeg|png)$/.test(blob.type.split(';')[0].toLowerCase()))
                    throw new Error(blob.type.startsWith('application/pdf') ? 'This document is a PDF. Use the authorized web review to inspect every page.' : 'This document format cannot be displayed on this device.');
                if (blob.size > 5 * 1024 * 1024)
                    throw new Error('This image is too large for the private mobile preview. Use the authorized web review.');
                const uri = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    const stop = () => {
                        done();
                        reject(new Error('Document preview cancelled.'));
                        reader.abort();
                    };
                    const timer = setTimeout(() => {
                        done();
                        reject(new Error('The image preview timed out. Close it and try again.'));
                        reader.abort();
                    }, 10000);
                    const done = () => {
                        clearTimeout(timer);
                        abort.signal.removeEventListener('abort', stop);
                        reader.onload = null;
                        reader.onerror = null;
                        reader.onabort = null;
                    };
                    reader.onload = () => {
                        done();
                        resolve(String(reader.result));
                    };
                    reader.onerror = () => {
                        done();
                        reject(new Error('Could not read the private image.'));
                    };
                    reader.onabort = () => {
                        done();
                        reject(new Error('Image preview cancelled.'));
                    };
                    abort.signal.addEventListener('abort', stop, {
                        once: true
                    });
                    if (abort.signal.aborted) {
                        stop();
                        return;
                    }
                    try {
                        reader.readAsDataURL(blob);
                    }
                    catch (e) {
                        done();
                        reject(e);
                    }
                });
                if (alive && version.current === current)
                    setImage({
                        uri, resource, version: current
                    });
            }
            catch (e) {
                if (alive && !abort.signal.aborted && version.current === current)
                    setError(e instanceof Error ? e.message : 'Could not retrieve the private document.');
            }
            finally {
                if (alive && version.current === current)
                    setLoading(false);
            }
        })();
        return () => {
            alive = false;
            abort.abort();
            callback.current?.(false);
        };
    }, [open, path, token]);
    return <View style={{
        gap: 8
    }}><Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Close' : 'Inspect'} ${label}`} onPress={() => setOpen(v => !v)} style={{
        padding: 11, backgroundColor: C.blue50, borderColor: C.blue100, borderWidth: 1, borderRadius: 10
    }}><T s={13} w="semibold" c={C.royal}>{open ? 'Close document' : `Inspect original ${label}`}</T></Pressable>
    {open && <View style={{
            gap: 7
        }}>{loading && <ActivityIndicator color={C.royal}/>}{!!error && <T s={12} c={C.red700}>{error}</T>}
    {image?.resource === resource && <Image accessibilityLabel={`Private ${label}`} source={{
            uri: image.uri
        }} resizeMode="contain" onLoad={() => {
            if (currentResource.current === image.resource && version.current === image.version)
                callback.current?.(true);
        }} onError={() => {
            if (currentResource.current !== image.resource || version.current !== image.version)
                return;
            callback.current?.(false);
            setError('The private image could not be displayed. Close it and retry.');
        }} style={{
            height: 300, width: '100%', backgroundColor: C.slate100, borderRadius: 9
        }}/>}
    <T s={11} c={C.slate500}>Review the complete document and compare the printed details. This private preview is not saved to your photo library.</T></View>}</View>;
}
