import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useGateNotice } from '../hooks/useGateNotice';
import { Btn, Card, T } from './ui';
import { C } from '../theme';

/** This reviews access records; it cannot clear the gate PC's physical review flag. */
export default function GateNoticePanel() {
  const { state, dismiss, reviewed } = useGateNotice();
  const [checkedRevision, setCheckedRevision] = useState<number | null>(null);
  const checked = checkedRevision === state.revision;
  if (!state.notice && !state.busy && !state.pending && !state.reviewing) return null;
  return <Card bg={state.reviewing ? C.amber50 : C.blue50} style={{ gap: 9 }}>
    <T s={13} w="semibold" c={C.navy}>Gate action status</T>
    <T s={12} c={C.slate700}>{state.message}</T>
    {state.reviewing && <>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I checked the access record and gate operator" accessibilityState={{ checked }} onPress={() => setCheckedRevision(v => v === state.revision ? null : state.revision)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 8 }}>
        <View style={{ width: 20, height: 20, borderWidth: 2, borderRadius: 4, borderColor: C.royal, backgroundColor: checked ? C.royal : C.white }} />
        <T s={12} c={C.slate700} style={{ flex: 1 }}>I checked the access record with the gate operator. I will not repeat an action that is already recorded.</T>
      </Pressable>
      <Btn label="Confirm access-record review" py={10} disabled={!checked || state.busy || state.pending} onPress={() => { if (checkedRevision === state.revision) reviewed(checkedRevision); }}/>
      <T s={11} c={C.amber800}>Controller REVIEW and supervised CLOSE are performed at the gate PC.</T>
    </>}
    {!state.busy && !state.pending && !state.reviewing && <Btn label="Hide gate notice" py={9} bg={C.white} color={C.royal} onPress={dismiss}/>}
  </Card>;
}
