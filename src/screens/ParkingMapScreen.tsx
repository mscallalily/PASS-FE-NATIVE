/** Native, interactive rendering of the exact Laravel/web parking geometry. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, PanResponder, Pressable, View } from 'react-native';
import Svg from 'react-native-svg';
import { ArrowDownToLine, ArrowUpFromLine, Layers, Maximize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Btn, Card, Field, Frame, T } from '../components/ui';
import { Select } from '../components/Select';
import { C } from '../theme';
import { NavyHeader } from './shared';
import { canOperateSlots, getParkingMap, slotColors, WEB_BAY_COUNTS, type MapSlot, type ParkingMapData, type Point } from '../services/parkingMap';
import { ParkingPlanNative, ParkingScene3DNative, project3D } from '../components/ParkingSceneNative';
import ParkingWeb3DNative from '../components/ParkingWeb3DNative';

type ViewRect = [number, number, number, number];
type DisplayMode = 'plan' | '3d';
type Area = 'ALL' | 'MC' | 'CAR';
const isPlaced = (s: MapSlot) => s.placed && s.x !== null && s.y !== null && s.w !== null && s.h !== null;
const point = (p: Point, mode: DisplayMode): Point => mode === 'plan' ? p : project3D(p);
const rectCorners = (x: number, y: number, w: number, h: number, degrees: number): Point[] => {
  const angle = degrees * Math.PI / 180;
  const cs = Math.cos(angle), sn = Math.sin(angle);
  return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy]) => [x + dx*cs - dy*sn, y + dx*sn + dy*cs]);
};

/** Fit the shared geometry, optionally narrowing to a real parking area. */
export function mapBounds(data: ParkingMapData, mode: DisplayMode, area: Area): ViewRect {
  const [, , width, height] = data.view_box;
  const [x, y] = data.view_box;
  let pts: Point[] = area === 'ALL'
    ? [[x,y],[x+width,y],[x,y+height],[x+width,y+height]]
    : data.geometry.areas.filter(a => a.area === area).flatMap(a => a.polygon);
  if (area !== 'ALL') pts = pts.concat(data.slots.filter(s => s.area_code === area && isPlaced(s)).flatMap(s => rectCorners(s.x!,s.y!,s.w!,s.h!,s.rotation)));
  if (!pts.length) return mapBounds(data, mode, 'ALL');
  const transformed = pts.map(p => point(p, mode));
  const minX = Math.min(...transformed.map(p => p[0])), maxX = Math.max(...transformed.map(p => p[0]));
  const minY = Math.min(...transformed.map(p => p[1])), maxY = Math.max(...transformed.map(p => p[1]));
  const pad = area === 'ALL' ? 9 : 16;
  return [minX - pad, minY - pad, Math.max(30, maxX-minX+pad*2), Math.max(24, maxY-minY+pad*2)];
}

function NativeLayout({ data, mode, area, selected, onSelect, onGate }: {
  data: ParkingMapData; mode: DisplayMode; area: Area;
  selected: number | null; onSelect: (slot: MapSlot) => void; onGate: () => void;
}) {
  // Polling creates new response objects, but the physical camera must not
  // reset every five seconds while someone is panning or inspecting a bay.
  const nextBounds = mapBounds(data, mode, area);
  const full = useMemo(() => nextBounds, [nextBounds.join(',')]);
  const [camera, setCamera] = useState<ViewRect>(full);
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const start = useRef<ViewRect>(camera);
  const [viewWidth, setViewWidth] = useState(340);
  const pinchStart = useRef<number | null>(null);
  useEffect(() => { setCamera(full); cameraRef.current = full; }, [full]);

  const zoom = (factor: number) => setCamera(c => {
    const w = Math.min(full[2]*2, Math.max(full[2]/12, c[2]/factor));
    const h = c[3] * (w / c[2]);
    return [c[0]+(c[2]-w)/2, c[1]+(c[3]-h)/2, w, h];
  });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4 || g.numberActiveTouches > 1,
    onPanResponderGrant: () => { start.current = cameraRef.current; pinchStart.current = null; },
    onPanResponderMove: (event, gesture) => {
      const b = start.current;
      const touches = event.nativeEvent.touches;
      if (touches.length > 1) {
        const dist = Math.hypot(touches[0].pageX-touches[1].pageX, touches[0].pageY-touches[1].pageY);
        if (pinchStart.current === null) { pinchStart.current = dist; start.current = cameraRef.current; return; }
        const scale = Math.max(0.5, Math.min(4, dist / (pinchStart.current || 1)));
        const w = Math.min(full[2]*2, Math.max(full[2]/12, start.current[2]/scale));
        const h = start.current[3] * w / start.current[2];
        setCamera([start.current[0]+(start.current[2]-w)/2, start.current[1]+(start.current[3]-h)/2, w, h]);
      } else if (pinchStart.current === null) {
        // Preserve world distances when the zoom level changes.
        setCamera([b[0]-gesture.dx*b[2]/viewWidth, b[1]-gesture.dy*b[2]/viewWidth, b[2],b[3]]);
      }
    },
    onPanResponderRelease: () => { pinchStart.current = null; },
    onPanResponderTerminate: () => { pinchStart.current = null; },
  }), [full, viewWidth]);

  const showPlates = camera[2] < 180;
  const background = mode === 'plan' ? '#F8FAFC' : '#EEF2F7';
  const imageHeight = viewWidth > 600
    ? Math.max(260, Math.min(640, Math.round(viewWidth / 2.45)))
    : Math.min(540, Math.max(380, Math.round(viewWidth * 1.30)));

  return <View style={{ borderColor: C.slate200, borderWidth: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: background }}>
    <View onLayout={e => setViewWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
      <Svg width="100%" height={imageHeight} viewBox={camera.join(' ')} preserveAspectRatio="xMidYMid meet">
        {mode === '3d'
          ? <ParkingScene3DNative data={data} area={area} selectedId={selected} onSelect={onSelect} onGate={onGate} showPlates={showPlates}/>
          : <ParkingPlanNative data={data} area={area} selectedId={selected} onSelect={onSelect} onGate={onGate} showPlates={showPlates}/>}
      </Svg>
    </View>
    <View style={{ padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <T s={11} c={C.slate500} style={{ flex: 1 }}>Drag to pan · pinch or use ± to zoom · tap a slot</T>
      {([{ Icon: ZoomIn, label: 'Zoom in', action: () => zoom(1.4) }, { Icon: ZoomOut, label: 'Zoom out', action: () => zoom(1/1.4) }, { Icon: Maximize2, label: 'Whole selected area', action: () => setCamera(full) }] as const).map(({Icon,label,action}) =>
        <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{ padding: 8, backgroundColor: C.blue50, borderRadius: 9 }}><Icon size={17} color={C.royal}/></Pressable>)}
    </View>
  </View>;
}

function ChoiceBar<T extends string>({ choices, value, change }: { choices: {key:T;label:string}[]; value:T; change:(next:T)=>void }) {
  return <View style={{ flexDirection:'row', flexWrap:'wrap', gap:7 }}>
    {choices.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: value===item.key }} onPress={() => change(item.key)}
      style={{ paddingHorizontal:11,paddingVertical:9,borderWidth:1,borderColor:value===item.key?C.royal:C.slate200,backgroundColor:value===item.key?C.navy:C.white,borderRadius:9 }}>
      <T s={12} w="semibold" c={value===item.key?C.white:C.slate600}>{item.label}</T>
    </Pressable>)}
  </View>;
}

const readDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';
function Detail({ label, value }: {label:string;value:string}) {
  return <View style={{flexDirection:'row',paddingVertical:7,borderBottomWidth:1,borderBottomColor:C.slate100,gap:10}}>
    <T s={12} c={C.slate500} style={{width:104}}>{label}</T><T s={12} w="medium" c={C.slate700} style={{flex:1,textAlign:'right'}}>{value}</T>
  </View>;
}

/** The exact map endpoint determines which private fields each account can see. */
export default function ParkingMapScreen({ back }: { back?: () => void }) {
  const { token, user } = useAuth();
  const [data, setData] = useState<ParkingMapData|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<DisplayMode>('3d');
  const [area, setArea] = useState<Area>('ALL');
  const [selectedId, setSelectedId] = useState<number|null>(null);
  const [reason,setReason] = useState('');
  const [observed, setObserved] = useState('');
  const [otherTxn, setOtherTxn] = useState('');
  const [transactions,setTransactions] = useState<{transaction_id:number;plate_number:string;slot_code:string|null}[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [showGate,setShowGate] = useState(false);
  const [gateMethod,setGateMethod] = useState<'rfid_tag_uid'|'qr_pass_code'|'plate_number'>('rfid_tag_uid');
  const [gateDirection,setGateDirection] = useState<'entry'|'exit'>('entry');
  const [gateValue,setGateValue] = useState('');
  const [gateResult,setGateResult] = useState('');
  const sequence = useRef(0);
  const refreshing = useRef(false);
  const load = useCallback(async (silent=false) => {
    if (!token || refreshing.current) return;
    refreshing.current = true;
    const seq = ++sequence.current;
    if (!silent) setLoading(true);
    try {
      const next = await getParkingMap(token,user?.role ?? null);
      if (seq !== sequence.current) return;
      setData(next); setError('');
    } catch (e) { if (seq===sequence.current) setError(e instanceof Error?e.message:'Could not load parking map.'); }
    finally { refreshing.current=false; if (seq===sequence.current) setLoading(false); }
  },[token,user?.role]);
  useEffect(() => {
    setData(null); setSelectedId(null); void load();
    // The public /sync/revision marker is deliberately account-scoped. Poll
    // the authoritative availability map for cross-account occupancy changes.
    const interval = setInterval(() => { if (AppState.currentState==='active') void load(true); },5000);
    return () => { clearInterval(interval); sequence.current++; };
  },[load]);
  const selected = data?.slots.find(s => s.slot_id === selectedId) ?? null;
  const canMutate = !!data?.hasStaffDetails && canOperateSlots(user?.role ?? null);
  useEffect(() => {
    setReason('');setObserved('');setOtherTxn('');setTransactions([]);
    if (!token || !canMutate || selectedId===null) return;
    let active=true;
    api<{data:typeof transactions}>('/parking/transactions?status=active',{token})
      .then(r=>{ if(active) setTransactions(r.data ?? []); }).catch(()=>{});
    return () => {active=false;};
  },[token,canMutate,selectedId]);
  const mutation = async (path:string, method:'PATCH'|'POST', json:unknown) => {
    if (!token || busy || !canMutate) return;
    setBusy(true);setMessage('');
    try {
      const result=await api<{message?:string;status?:string}>(path,{token,method,json});
      setMessage(result.message ?? 'PASS updated the parking record.');
      setSelectedId(null);await load(true);
    } catch(e) { Alert.alert('PASS action failed',e instanceof Error?e.message:'The server rejected this action.'); }
    finally {setBusy(false);}
  };
  const confirm=(title:string,path:string,method:'PATCH'|'POST',json:unknown)=>Alert.alert(title,'Save this change to the shared PASS parking database?',[
    {text:'Cancel',style:'cancel'},{text:'Confirm',onPress:()=>void mutation(path,method,json)},
  ]);
  const gateSubmit=()=>{
    if (!token || !canMutate || !gateValue.trim() || busy) return;
    Alert.alert(`Record ${gateDirection}`,'Laravel will validate the credential and authorization before updating parking.',[
      {text:'Cancel',style:'cancel'}, {text:'Proceed',onPress:()=>{
        setBusy(true);setGateResult('');
        api<{message:string;status:string;slot_code?:string}>(`/parking/${gateDirection}`,{token,method:'POST',json:{[gateMethod]:gateValue.trim()}})
          .then(r=>{setGateResult(`${r.status}: ${r.message}${r.slot_code?` · Slot ${r.slot_code}`:''}`);setGateValue('');void load(true);})
          .catch(e=>setGateResult(e instanceof Error?e.message:'Gate operation failed.'))
          .finally(()=>setBusy(false));
      }},
    ]);
  };
  const groups = data?.areas ?? [];
  const unplaced = data?.slots.filter(s=>!isPlaced(s) && (area==='ALL'||s.area_code===area)) ?? [];
  return <Frame topInset={false} bottomPad={30} onRefresh={()=>void load()} refreshing={loading}>
    <NavyHeader pb={32}>
      {back && <Pressable onPress={back} style={{paddingBottom:10}}><T s={12} c={C.blue200}>‹ Back to workspace</T></Pressable>}
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
        <View style={{flex:1,gap:5}}><T s={11} w="semibold" c={C.blue200}>LIVE CAMPUS PARKING</T><T s={24} w="head" c={C.white}>Interactive parking map</T><T s={12} c={C.blue200}>Shared plan, occupancy and slot records</T></View>
        <Pressable accessibilityLabel="Refresh map" onPress={()=>void load()} style={{padding:10,backgroundColor:'#293A94',borderRadius:10}}><RefreshCw size={20} color={C.white}/></Pressable>
      </View>
    </NavyHeader>
    <View style={{padding:15,gap:13}}>
      {!!error && <Card bg={C.red50} border={C.red200}><T s={13} c={C.red700}>{data?'Map may be outdated. ':''}{error}</T><Btn label="Retry" py={9} onPress={()=>void load()}/></Card>}
      {!!message && <Card bg={C.green50}><T s={13} c={C.green700}>{message}</T></Card>}
      {loading&&!data && <ActivityIndicator color={C.royal} size="large"/>}
      {data && <>
        <Card style={{gap:11}}>
          <ChoiceBar choices={[{key:'3d',label:'3D View'},{key:'plan',label:'Plan View'}]} value={mode} change={setMode}/>
          <ChoiceBar choices={[{key:'ALL',label:'Whole site'},{key:'MC',label:'Motorcycles'},{key:'CAR',label:'Cars'}]} value={area} change={next=>{setArea(next);setSelectedId(null);}} />
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
            <T s={12} w="semibold" c={C.navy}>Web layout: {WEB_BAY_COUNTS.MC} motorcycles · {WEB_BAY_COUNTS.CAR} cars</T>
            <T s={11} c={C.slate500}>All numbered bay positions supplied and verified by Laravel (M-01–M-84, C-01–C-45).</T>
          </View>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:11}}>
            {([{color:'#22C55E',label:'Available'},{color:'#EF4444',label:'Occupied'},{color:'#9CA3AF',label:'Maintenance / disabled'}] as const).map(e=><View key={e.label} style={{flexDirection:'row',gap:5,alignItems:'center'}}><View style={{width:12,height:12,borderRadius:3,backgroundColor:e.color}}/><T s={11} c={C.slate600}>{e.label}</T></View>)}
          </View>
          {mode==='3d'
            ? <ParkingWeb3DNative data={data} area={area} selectedId={selectedId} onSelect={s=>setSelectedId(s.slot_id)}
                onGate={() => canMutate ? setShowGate(true) : Alert.alert('Main entrance / exit', 'Gate operations require an authorized parking or security account.')}/>
            : <NativeLayout data={data} mode="plan" area={area} selected={selectedId} onSelect={s=>setSelectedId(s.slot_id)}
                onGate={() => canMutate ? setShowGate(true) : Alert.alert('Main entrance / exit', 'Gate operations require an authorized parking or security account.')}/>}
          <T s={11} c={C.slate500}>{mode==='3d'?'Native Three.js perspective based on the web parking model: the same site, gate, trees, slot geometry and statuses.':'Native top-down PASS web parking plan.'} Live availability comes from Laravel; measurements and physical capacity require campus verification.</T>
          <T s={11} c={C.slate400}>Synced {data.generated_at?readDate(data.generated_at):'from the server'} · checks for updates every 5 seconds while the app is active</T>
        </Card>
        <View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>
          {groups.filter(g=>area==='ALL'||g.area_code===area).map(g=><Card key={g.parking_area_id} style={{flex:1,minWidth:143,gap:5,padding:12}}>
            <T s={12} w="semibold">{g.area_name}</T><T s={20} w="bold" c={C.navy}>{g.available} <T s={12} c={C.slate500}>/ {g.capacity} free</T></T>
            <T s={11} c={C.slate500}>{g.occupied} occupied · {g.maintenance ?? 0} maintenance</T>
          </Card>)}
        </View>
        {selected && <Card style={{gap:10}}>
          <T s={18} w="head" c={C.navy}>Slot {selected.slot_code}</T>
          <View style={{borderRadius:9,backgroundColor:slotColors(selected).fill,padding:12,alignItems:'center'}}><T s={17} w="bold" c={C.white}>{selected.status.toUpperCase()}</T>
            {selected.status==='occupied' && selected.occupant?.confirmed===false && <T s={12} c={C.white}>Assigned position not confirmed</T>}
          </View>
          <Detail label="Parking area" value={selected.area_name}/>
          <Detail label="Accessibility" value={selected.accessible?'PWD / accessible':'Standard bay'}/>
          <Detail label="Position" value={isPlaced(selected)?'Proposed layout position':'Not mapped / inventory only'}/>
          {selected.occupant && data.hasStaffDetails && <>
            <Detail label="Plate" value={selected.occupant.plate_number}/><Detail label="Vehicle" value={selected.occupant.vehicle_type??'—'}/>
            <Detail label="Owner / visitor" value={selected.occupant.party_name??'—'}/>
            <Detail label="Entry time" value={readDate(selected.occupant.entry_datetime)}/>
            <Detail label="Access" value={selected.occupant.access_method}/>
            <Detail label="Location" value={selected.occupant.confirmed?'Confirmed':'Awaiting confirmation'}/>
          </>}
          {selected.incident && data.hasStaffDetails && <Card bg={C.amber50}><T s={12} c={C.amber800}>Wrong-slot incident: {selected.incident.plate_number} · assigned {selected.incident.assigned_slot}, observed {selected.incident.observed_slot}</T></Card>}
          {canMutate && <View style={{gap:9}}>
            {selected.occupant && <>
              {!selected.occupant.confirmed && <Btn label="Confirm vehicle in assigned slot" py={10} loading={busy} onPress={()=>confirm('Confirm observed slot',`/parking/transactions/${selected.occupant!.transaction_id}/observed-slot`,'POST',{slot_id:selected.slot_id})}/>}
              <Field label="Vehicle parked elsewhere — observed slot code" value={observed} onChangeText={setObserved} placeholder="C-08 or M-15" autoCapitalize="characters"/>
              <Btn label="Report actual location" py={10} bg={C.amber700} disabled={!observed.trim()||busy} onPress={()=>confirm('Report observed slot',`/parking/transactions/${selected.occupant!.transaction_id}/observed-slot`,'POST',{slot_code:observed.trim().toUpperCase()})}/>
            </>}
            {selected.status!=='maintenance' && <>
              <Select label="Report a different active vehicle in this slot" value={otherTxn} placeholder="Select parked vehicle" options={transactions.filter(t=>t.transaction_id!==selected.occupant?.transaction_id).map(t=>({value:String(t.transaction_id),label:`${t.plate_number} · assigned ${t.slot_code??'—'}`}))} onChange={setOtherTxn}/>
              <Btn label="Report different vehicle" py={10} bg={C.amber700} disabled={!otherTxn||busy} onPress={()=>confirm('Report wrong-slot observation',`/parking/transactions/${otherTxn}/observed-slot`,'POST',{slot_id:selected.slot_id})}/>
            </>}
            {!selected.occupant && (selected.status==='maintenance'
              ? <Btn label="Return slot to service" py={10} loading={busy} onPress={()=>confirm('Return slot to service',`/parking/slots/${selected.slot_id}`,'PATCH',{slot_status:'available'})}/>
              : <><Field label="Maintenance reason (optional)" value={reason} onChangeText={setReason} maxLength={255}/>
                <Btn label="Mark slot under maintenance" py={10} bg={C.slate600} loading={busy} onPress={()=>confirm('Mark slot under maintenance',`/parking/slots/${selected.slot_id}`,'PATCH',{slot_status:'maintenance',reason:reason.trim()||null})}/></>)}
          </View>}
          {!canMutate && <T s={12} c={C.slate500}>This account can view parking status. Operational changes require an authorized Parking Staff or Security account.</T>}
          <Btn label="Close slot details" py={10} bg={C.blue50} color={C.royal} onPress={()=>setSelectedId(null)}/>
        </Card>}
        {unplaced.length>0 && <Card style={{gap:8}}><T s={14} w="semibold">Unmapped slot inventory ({unplaced.length})</T>
          <T s={11} c={C.slate500}>These live PASS slot records have no position in the measured layout. No physical space is invented.</T>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:5}}>{unplaced.map(s=><Pressable key={s.slot_id} onPress={()=>setSelectedId(s.slot_id)} style={{borderRadius:7,padding:6,backgroundColor:slotColors(s).fill}}><T s={11} c={C.white} w="bold">{s.slot_code}</T></Pressable>)}</View>
        </Card>}
        {!!data.ambiguities?.length && <Card style={{gap:5}}><T s={13} w="semibold">Layout notes</T>{data.ambiguities.map((note,i)=><T key={i} s={11} c={C.slate500}>• {note}</T>)}</Card>}
        {canMutate && <Card style={{gap:10}}>
          <Pressable onPress={()=>setShowGate(v=>!v)} style={{flexDirection:'row',alignItems:'center',gap:7}}><Layers size={16} color={C.royal}/><T s={15} w="semibold" c={C.navy}>{showGate?'Hide gate controls':'Main Entrance / Exit controls'}</T></Pressable>
          {showGate && <>
            <T s={12} c={C.slate500}>Record authorized RFID, visitor QR or staff plate override using the same server checks as web.</T>
            <ChoiceBar choices={[{key:'entry',label:'Entry'},{key:'exit',label:'Exit'}]} value={gateDirection} change={setGateDirection}/>
            <ChoiceBar choices={[{key:'rfid_tag_uid',label:'RFID'},{key:'qr_pass_code',label:'Visitor QR'},{key:'plate_number',label:'Plate override'}]} value={gateMethod} change={setGateMethod}/>
            <Field label={gateMethod==='rfid_tag_uid'?'RFID UID':gateMethod==='qr_pass_code'?'QR pass code':'Plate number'} value={gateValue} onChangeText={setGateValue} autoCapitalize="characters"/>
            <Btn label={`Record vehicle ${gateDirection}`} icon={gateDirection==='entry'?<ArrowDownToLine color={C.white} size={16}/>:<ArrowUpFromLine color={C.white} size={16}/>} disabled={busy||!gateValue.trim()} loading={busy} py={11} onPress={gateSubmit}/>
            {!!gateResult && <T s={13} c={C.navy}>{gateResult}</T>}
          </>}
        </Card>}
      </>}
    </View>
  </Frame>;
}
