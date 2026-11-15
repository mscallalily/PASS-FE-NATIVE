import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { api } from '../api/client';
import { toUploadFile } from '../api/upload';
import { useAuth } from '../context/AuthContext';
import { Btn, FileUpload, type PickedFile, T } from './ui';
import type { Reading } from '../services/orcrReview';
import { C } from '../theme';
type Result = Reading & {
    message?: string;
    issues?: string[];
};
export default function VehicleDocumentReview({ kind, file, disabled, onChange, onReading, onError }: {
    kind: 'OR' | 'CR';
    file: PickedFile | null;
    disabled: boolean;
    onChange: (f: PickedFile | null) => void;
    onReading: (r: Reading | null) => void;
    onError: (m: string) => void;
}) {
    const { token } = useAuth(), callbacks = useRef({
        onReading, onError
    });
    callbacks.current = {
        onReading, onError
    };
    const [retry, setRetry] = useState(0), [result, setResult] = useState<Result | null>(null);
    useEffect(() => {
        const abort = new AbortController();
        let alive = true;
        if (!file) {
            setResult(null);
            callbacks.current.onReading(null);
            return;
        }
        if (!token)
            return;
        const reading = {
            status: 'reading', fields: {}, flags: {}
        };
        setResult(reading);
        callbacks.current.onReading(reading);
        const form = new FormData();
        form.append('document_type', kind === 'OR' ? 'vehicle_or' : 'vehicle_cr');
        form.append('document', toUploadFile(file) as unknown as Blob, file.name);
        api<Result>('/documents/autofill', {
            token, method: 'POST', form, signal: abort.signal, timeoutMs: 120000
        }).then(value => {
            if (!alive)
                return;
            if (!value || typeof value.status !== 'string' || !value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields) || Object.values(value.fields).some(v => !['string', 'number'].includes(typeof v)) || !value.flags || typeof value.flags !== 'object' || Array.isArray(value.flags) || Object.values(value.flags).some(v => typeof v !== 'string') || (value.issues !== undefined && (!Array.isArray(value.issues) || value.issues.some(v => typeof v !== 'string'))))
                throw new Error('PASS returned an incomplete document reading. Retry the photo.');
            setResult(value);
            callbacks.current.onReading(value);
        }).catch(error => {
            if (!alive || abort.signal.aborted)
                return;
            const failed = {
                status: 'unavailable', fields: {}, flags: {}, message: error instanceof Error ? error.message : 'The reader could not finish. Retry this photo.'
            };
            setResult(failed);
            callbacks.current.onReading(failed);
        });
        return () => {
            alive = false;
            abort.abort();
        };
    }, [file, token, kind, retry]);
    return <View style={{
        gap: 8
    }}><FileUpload label={kind === 'OR' ? 'Official Receipt (OR)' : 'Certificate of Registration (CR)'} file={file} disabled={disabled} imagesOnly onChange={onChange} onError={onError}/>
    {!!file && <Image source={{
        uri: file.uri
    }} resizeMode="contain" style={{
        height: 150, backgroundColor: C.slate50, borderRadius: 10
    }}/>}
    {result?.status === 'reading' && <View style={{
        flexDirection: 'row', gap: 9
    }}><ActivityIndicator color={C.royal}/><T s={12}>Reading {kind}…</T></View>}
    {!!result?.message && <T s={12} c={['ok', 'partial'].includes(result.status) ? C.slate600 : C.red700}>{result.message}</T>}
    {result?.issues?.map((issue, i) => <T key={i} s={12} c={C.slate600}>{issue}</T>)}
    {!!file && result?.status !== 'reading' && <Btn label={`Read ${kind} again`} py={9} disabled={disabled} bg={C.blue50} color={C.royal} onPress={() => setRetry(v => v + 1)}/>}</View>;
}
