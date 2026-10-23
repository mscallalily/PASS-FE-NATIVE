/** Native parity for PASS web RFID Management: Access Records and RFID Credentials.
 * Hardware scans remain restricted to the registered reader service on the gate PC.
 * Access records are read-only; only system admin may see assignment/revoke controls.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, View } from 'react-native';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown, CreditCard, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canAccessModule } from '../permissions';
import { Card, Field, Frame, T, Btn } from '../components/ui';
import { C } from '../theme';
import { NavyHeader } from './shared';
import { accessEventQuery, assignmentIssue, campusToday, DEFAULT_GATE_FILTERS, eligibleVehicles, filterCredentials, manilaDateTime,
  type GateEvent, type GateFilters, type RfidCredential, type AssignableVehicle, type TodayGateSummary,
  type AccessMethod, type Direction, type AccessResult } from '../services/rfid';

type Tab = 'events' | 'credentials';
const METHOD_LABEL: Record<AccessMethod, string> = { rfid:'RFID', qr:'Visitor QR', manual:'Plate (staff override)' };
const SOURCE_LABEL: Record<string,string> = {reader:'RFID reader',staff_gate:'Staff gate screen',simulator:'Simulator'};
const PERIODS = [{label:'All dates',value:''},{label:'Today',value:'today'}] as const;
const METHODS = [{label:'RFID only',value:'rfid'},{label:'Visitor QR',value:'qr'},{label:'Staff overrides',value:'manual'},{label:'All credentials',value:''}] as const;
const DIRECTIONS = [{label:'Entry + exit',value:''},{label:'Entry',value:'in'},{label:'Exit',value:'out'}] as const;
const RESULTS = [{label:'All results',value:''},{label:'Granted',value:'granted'},{label:'Denied',value:'denied'}] as const;

function Chip({ label, chosen, onPress }: {label:string;chosen:boolean;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected:chosen}} accessibilityLabel={label} onPress={onPress}
    style={{backgroundColor:chosen?C.navy:C.white,borderColor:chosen?C.navy:C.slate200,borderWidth:1,borderRadius:100,paddingVertical:8,paddingHorizontal:11,minHeight:38,justifyContent:'center'}}>
    <T s={11} w="semibold" c={chosen?C.white:C.slate600}>{label}</T>
  </Pressable>;
}
function ChipRow<T extends string>({options,value,onChange}: {options:readonly {label:string;value:T}[];value:T;onChange:(v:T)=>void}) {
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{options.map(option=><Chip key={`${option.value}-${option.label}`} label={option.label} chosen={value===option.value} onPress={()=>onChange(option.value)} />)}</View>;
}
function Pill({text,good}: {text:string;good?:boolean}) {
  return <View style={{alignSelf:'flex-start',backgroundColor:good===undefined?C.blue50:good?C.green50:C.red50,borderRadius:99,paddingHorizontal:9,paddingVertical:5}}>
    <T s={11} w="semibold" c={good===undefined?C.royal:good?C.green700:C.red700}>{text}</T>
  </View>;
}
function Info({ label, value }: {label:string;value:string | null | number | undefined}) {
  return <View style={{flexDirection:'row',gap:8,paddingVertical:4}}>
    <T s={11} c={C.slate500} style={{width:100}}>{label}</T>
    <T s={12} w="medium" c={C.navy} style={{flex:1}}>{value === null || value === undefined || value === '' ? '—' : String(value)}</T>
  </View>;
}
function SummaryTile({label,value,tone}:{label:string;value:number|undefined;tone?:'danger'|'success'}) {
  const tint=tone==='danger'?C.red600:tone==='success'?C.green700:C.royal;
  return <View style={{flexGrow:1,width:'47%',backgroundColor:C.white,borderWidth:1,borderColor:C.blue100,borderRadius:16,padding:14,gap:6}}>
    <T s={25} w="bold" c={tint}>{value===undefined?'—':value}</T>
    <T s={12} c={C.slate600}>{label}</T>
  </View>;
}
function LoadingOrError({loading,error,onRetry}:{loading:boolean;error:string;onRetry:()=>void}) {
  if (error) return <Card bg={C.red50} border={C.red200} style={{gap:10}}><T s={13} c={C.red700}>{error}</T><Btn label="Retry" onPress={onRetry} py={10}/></Card>;
  if (loading) return <Card style={{flexDirection:'row',gap:10,alignItems:'center'}}><ActivityIndicator color={C.royal}/><T s={12} c={C.slate500}>Loading live PASS records…</T></Card>;
  return null;
}

export default function RfidWorkspaceScreen({back,initialTab='events'}:{back:()=>void;initialTab?:Tab}) {
  const {token,user}=useAuth();
  const isAdmin=user?.role==='admin'; // Web shows issuance and revocation controls only to System Admin.
  const allowed=canAccessModule(user?.role??null,'rfid') || canAccessModule(user?.role??null,'access-events');
  const [tab,setTab]=useState<Tab>(initialTab);
  const [filters,setFilters]=useState<GateFilters>(DEFAULT_GATE_FILTERS);
  const [search,setSearch]=useState('');
  const [searchApplied,setSearchApplied]=useState('');
  const [eventRows,setEventRows]=useState<GateEvent[]>([]);
  const [today,setToday]=useState<TodayGateSummary|null>(null);
  const [credentials,setCredentials]=useState<RfidCredential[]>([]);
  const [vehicles,setVehicles]=useState<AssignableVehicle[]>([]);
  const [vehicleError,setVehicleError]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshTick,setRefreshTick]=useState(0);
  const [busy,setBusy]=useState(false);
  const [openAssign,setOpenAssign]=useState(false);
  const [uid,setUid]=useState('');
  const [vehicleId,setVehicleId]=useState('');
  const [validUntil,setValidUntil]=useState('');
  const [success,setSuccess]=useState('');
  const [expanded,setExpanded]=useState<Record<number,boolean>>({});
  useEffect(()=>{const handle=setTimeout(()=>setSearchApplied(search.trim()),300);return ()=>clearTimeout(handle);},[search]);
  const activeFilters=useMemo(()=>({...filters,search:searchApplied}),[filters,searchApplied]);
  const load=useCallback(async(silent=false)=>{
    if(!token||!allowed)return;
    if(!silent)setLoading(true);
    setError('');
    try {
      if(tab==='events') {
        const response=await api<{data:GateEvent[];today:TodayGateSummary}>(accessEventQuery(activeFilters),{token});
        setEventRows(response.data??[]);setToday(response.today??null);
      } else {
        const response=await api<{data:RfidCredential[]}>('/rfid/assignments',{token});
        setCredentials(response.data??[]);
      }
    } catch(e) {setError(e instanceof Error?e.message:'Cannot load RFID records.');}
    finally {if(!silent)setLoading(false);}
  },[token,allowed,tab,activeFilters]);
  useEffect(()=>{void load();},[load,refreshTick]);
  // Like web live-sync, only refresh while this screen is active and the app foregrounded.
  useEffect(()=>{
    let foreground=AppState.currentState==='active';
    const sub=AppState.addEventListener('change',state=>{foreground=state==='active';if(foreground)void load(true);});
    const poll=setInterval(()=>{if(foreground&&!busy)void load(true);},12000);
    return ()=>{sub.remove();clearInterval(poll);};
  },[load,busy]);
  useEffect(()=>{
    if(!token||!isAdmin||tab!=='credentials')return;
    let live=true;
    api<{vehicles:AssignableVehicle[]}>('/vehicles',{token}).then(r=>{if(live){setVehicles(eligibleVehicles(r.vehicles??[]));setVehicleError('');}})
      .catch(e=>{if(live)setVehicleError(e instanceof Error?e.message:'Cannot load eligible vehicles.');});
    return ()=>{live=false;};
  },[token,isAdmin,tab,refreshTick]);
  const refresh=()=>setRefreshTick(n=>n+1);
  const updateFilter=<K extends keyof GateFilters>(key:K,value:GateFilters[K])=>setFilters(v=>({...v,[key]:value}));
  const submitAssign=()=>{
    const problem=assignmentIssue(uid,vehicleId,validUntil,campusToday());
    if(problem){Alert.alert('Check RFID details',problem);return;}
    Alert.alert('Issue RFID credential','Confirm that the physical tag, plate, driver and submitted records were checked. This does not record gate entry.',[
      {text:'Cancel',style:'cancel'},
      {text:'Assign RFID',onPress:()=>{void (async()=>{
        if(!token||!isAdmin||busy)return;
        setBusy(true);setError('');setSuccess('');
        try {
          const r=await api<{message:string}>('/rfid/assignments',{token,method:'POST',json:{tag_uid:uid.trim(),vehicle_id:Number(vehicleId),valid_until:validUntil.trim()||null}});
          setSuccess(r.message);setUid('');setVehicleId('');setValidUntil('');setOpenAssign(false);refresh();
        }catch(e){setError(e instanceof Error?e.message:'RFID assignment failed.');}finally{setBusy(false);}
      })();}}
    ]);
  };
  const revoke=(credential:RfidCredential)=>{
    if(!credential.assignment_id||!isAdmin||busy)return;
    Alert.alert('Revoke RFID?',`Revoke ${credential.tag_uid}? Future entry scans will be denied. A vehicle with an active parking session must exit first.`,[
      {text:'Cancel',style:'cancel'},
      {text:'Revoke',style:'destructive',onPress:()=>{void (async()=>{
        if(!token)return;setBusy(true);setError('');setSuccess('');
        try{const r=await api<{message:string}>(`/rfid/assignments/${credential.assignment_id}/revoke`,{token,method:'PATCH'});setSuccess(r.message);refresh();}
        catch(e){setError(e instanceof Error?e.message:'Revocation failed.');}finally{setBusy(false);}
      })();}}
    ]);
  };
  const filtered=filterCredentials(credentials,search);
  if(!token||!allowed)return <Frame><Card><LockKeyhole color={C.red600}/><T s={14}>Only authorized PASS staff can view RFID credentials and gate events.</T></Card></Frame>;
  return <Frame topInset={false} bottomPad={32} onRefresh={refresh} refreshing={loading}>
    <NavyHeader pb={26}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to workspace" onPress={back} style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:16}}><ArrowLeft size={16} color={C.blue200}/><T s={13} c={C.blue200}>Workspace</T></Pressable>
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:42,height:42,borderRadius:13,backgroundColor:'#232282',alignItems:'center',justifyContent:'center'}}><CreditCard size={22} color={C.white}/></View><View style={{flex:1}}><T s={22} w="head" c={C.white}>RFID & Access</T><T s={12} c={C.blue200}>Live PASS gate and credential records</T></View></View>
    </NavyHeader>
    <View style={{padding:16,gap:15}}>
      <View style={{flexDirection:'row',backgroundColor:C.white,borderWidth:1,borderColor:C.blue100,borderRadius:15,padding:5,gap:5}}>
        {([{value:'events',label:'Access Records'},{value:'credentials',label:'RFID Credentials'}] as const).map(item=><Pressable key={item.value} accessibilityRole="tab" accessibilityState={{selected:tab===item.value}} onPress={()=>{setTab(item.value);setError('');setSearch('');setExpanded({});}} style={{flex:1,paddingVertical:12,backgroundColor:tab===item.value?C.navy:C.white,borderRadius:11,alignItems:'center'}}><T s={12} w="semibold" c={tab===item.value?C.white:C.slate600}>{item.label}</T></Pressable>)}
      </View>
      {!!success&&<Card bg={C.green50} border={C.green500} style={{flexDirection:'row',gap:8,alignItems:'center'}}><CheckCircle2 color={C.green700} size={18}/><T s={12} c={C.green700} style={{flex:1}}>{success}</T></Card>}
      {tab==='events' ? <>
        <View style={{gap:9}}><T s={15} w="bold" c={C.navy}>Today's gate activity</T><View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
          <SummaryTile label="Granted entries" value={today?.entries} tone="success"/><SummaryTile label="Granted exits" value={today?.exits}/><SummaryTile label="Denied attempts" value={today?.denied} tone="danger"/><SummaryTile label="RFID scans" value={today?.rfid}/>
        </View><T s={11} c={C.slate500}>{today?`${today.qr??0} visitor QR · ${today.staff_override??0} manual scans`:'Waiting for gate statistics'} · Manila time</T></View>
        <Card style={{gap:12}}>
          <T s={15} w="bold" c={C.navy}>Filter access records</T>
          <Field label="Search" placeholder="Plate, user, RFID, name or denial reason" value={search} maxLength={100} onChangeText={setSearch} autoCorrect={false}/>
          <T s={11} w="semibold" c={C.slate500}>CREDENTIAL</T><ChipRow options={METHODS} value={filters.method} onChange={v=>updateFilter('method',v)}/>
          <T s={11} w="semibold" c={C.slate500}>DIRECTION</T><ChipRow options={DIRECTIONS} value={filters.direction} onChange={v=>updateFilter('direction',v)}/>
          <T s={11} w="semibold" c={C.slate500}>ACCESS RESULT</T><ChipRow options={RESULTS} value={filters.result} onChange={v=>updateFilter('result',v)}/>
          <T s={11} w="semibold" c={C.slate500}>DATE</T><ChipRow options={PERIODS} value={filters.date} onChange={v=>updateFilter('date',v)}/>
        </Card>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><T s={15} w="bold" c={C.navy}>Gate events · {eventRows.length}</T><Pressable accessibilityLabel="Refresh gate events" onPress={refresh} style={{padding:10}}><RefreshCw size={19} color={C.royal}/></Pressable></View>
        <LoadingOrError loading={loading} error={error} onRetry={refresh}/>
        {!loading&&!error&&eventRows.length===0&&<Card><T s={13} c={C.slate600}>No gate events match these filters.</T></Card>}
        {!error&&eventRows.map(r=><Card key={r.event_id} style={{gap:8}}>
          <View style={{flexDirection:'row',gap:9,alignItems:'center'}}>
            <View style={{borderRadius:12,padding:9,backgroundColor:C.blue50}}>{r.direction==='in'?<ArrowDownRight size={18} color={C.royal}/>:<ArrowUpRight size={18} color={C.royal}/>}</View>
            <View style={{flex:1,gap:3}}><T s={14} w="semibold" c={C.navy}>{r.plate_number||r.party_name||r.presented_credential||'Unidentified attempt'}</T><T s={11} c={C.slate500}>{manilaDateTime(r.event_datetime)} · #{r.event_id}</T></View>
            <Pill text={r.auth_result.toUpperCase()} good={r.auth_result==='granted'}/>
          </View>
          <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}><Pill text={r.direction==='in'?'Entry':'Exit'}/><Pill text={METHOD_LABEL[r.access_method]??r.access_method}/>{r.source&&<Pill text={SOURCE_LABEL[r.source]??r.source}/>}</View>
          <Info label="Gate" value={r.gate_name}/><Info label="User" value={r.party_name||r.user_code}/><Info label="Credential" value={r.rfid_tag||r.qr_pass_code||r.presented_credential}/>
          {r.rfid_assignment_id&&<Info label="Assignment" value={`#${r.rfid_assignment_id} · ${r.rfid_assignment_status??'—'}`}/>}
          {r.rfid_holder_code&&r.rfid_holder_code!==r.user_code&&<Info label="RFID holder" value={r.rfid_holder_code}/>}
          {r.vehicle_type&&<Info label="Vehicle type" value={r.vehicle_type}/>}
          {r.denial_reason&&<View style={{backgroundColor:C.red50,padding:10,borderRadius:10}}><T s={12} c={C.red700}>{r.denial_reason}</T></View>}
          <Info label="Recorded by" value={r.processed_by|| (r.source==='reader'?'RFID reader':'—')}/>
          {r.transaction_id&&<Info label="Parking stay" value={`#${r.transaction_id}`}/>}
        </Card>)}
      </>:<>
        <Card bg={C.blue50} border={C.blue100} style={{flexDirection:'row',gap:10}}><ShieldCheck color={C.royal} size={20}/><T s={12} c={C.navy} style={{flex:1}}>Tag issuance requires an approved vehicle, active owner and verified driver's license. The Laravel server is the final authority. Assignments never record parking entry.</T></Card>
        {isAdmin&&<Card style={{gap:12}}>
          <Pressable accessibilityRole="button" onPress={()=>setOpenAssign(v=>!v)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:44}}><T s={15} w="bold" c={C.navy}>Assign RFID to approved vehicle</T><ChevronDown size={18} color={C.royal}/></Pressable>
          {openAssign&&<>
            <T s={12} c={C.slate600}>Physically compare the vehicle, plate and driver with the submitted records before issuing an RFID sticker.</T>
            <Field label="Tag UID" placeholder="Exact UID read from the issued tag" maxLength={50} autoCapitalize="characters" autoCorrect={false} value={uid} onChangeText={setUid}/>
            <T s={12} w="semibold" c={C.navy}>Approved vehicle · no active tag</T>
            {!!vehicleError&&<T s={12} c={C.red700}>{vehicleError}</T>}
            {vehicles.length===0&&<T s={12} c={C.slate500}>No eligible vehicles returned by PASS. An approved, active authorization is required.</T>}
            {vehicles.map(v=><Pressable key={v.id} accessibilityRole="radio" accessibilityState={{checked:vehicleId===v.id}} onPress={()=>setVehicleId(v.id)} style={{padding:11,borderWidth:1,borderColor:vehicleId===v.id?C.royal:C.slate200,borderRadius:12,backgroundColor:vehicleId===v.id?C.blue50:C.white}}><T s={13} w="medium" c={C.navy}>{vehicleId===v.id?'◉ ':'○ '}{v.plate} · {v.owner}</T></Pressable>)}
            <Field label="Valid until (optional)" placeholder="YYYY-MM-DD" value={validUntil} maxLength={10} autoCapitalize="none" onChangeText={setValidUntil}/>
            <Btn label="Assign RFID" loading={busy} disabled={!uid.trim()||!vehicleId} onPress={submitAssign} py={13}/>
          </>}
        </Card>}
        {!isAdmin&&<Card><T s={12} c={C.slate600}>Credentials are read-only for your account. Only the System Administrator can issue or revoke RFID tags in the web workflow.</T></Card>}
        <Field label="Find RFID credentials" placeholder="Search tag, registered user or plate" value={search} onChangeText={setSearch} autoCorrect={false}/>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><T s={15} w="bold" c={C.navy}>Issued tags · {filtered.length}</T><Pressable accessibilityLabel="Refresh RFID credentials" onPress={refresh} style={{padding:10}}><RefreshCw size={19} color={C.royal}/></Pressable></View>
        <LoadingOrError loading={loading} error={error} onRetry={refresh}/>
        {!loading&&!error&&filtered.length===0&&<Card><T s={13} c={C.slate600}>No matching RFID credentials.</T></Card>}
        {!error&&filtered.map(r=><Card key={r.rfid_id} style={{gap:8}}>
          <View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}><CreditCard size={20} color={C.royal}/><View style={{flex:1,gap:4}}><T s={15} w="bold" c={C.navy}>{r.tag_uid}</T><T s={11} c={C.slate500}>{r.tag_type} · RFID #{r.rfid_id}</T></View><Pill text={r.tag_status} good={r.tag_status==='assigned'?true:r.tag_status==='available'?undefined:false}/></View>
          <Info label="Assigned user" value={r.user_name||r.user_code||'Unassigned'}/><Info label="User code" value={r.user_code}/><Info label="Vehicle plate" value={r.plate_number}/>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><T s={11} c={C.slate500}>Assignment {r.assignment_status??'—'}</T><Pressable accessibilityRole="button" onPress={()=>setExpanded(v=>({...v,[r.rfid_id]:!v[r.rfid_id]}))} style={{padding:8}}><T s={12} w="semibold" c={C.royal}>{expanded[r.rfid_id]?'Less detail ↑':'Full details ↓'}</T></Pressable></View>
          {!!expanded[r.rfid_id]&&<View style={{backgroundColor:C.slate50,borderRadius:12,padding:10,gap:2}}><Info label="Assigned at" value={manilaDateTime(r.assigned_at)}/><Info label="Valid until" value={r.valid_until??'No end date'}/><Info label="Expired" value={r.expired?'Yes':'No'}/><Info label="User type" value={r.user_type}/><Info label="Last scan" value={manilaDateTime(r.last_used)}/><Info label="Assignment ID" value={r.assignment_id}/></View>}
          {isAdmin&&r.assignment_status==='active'&&!!r.assignment_id&&<Btn label="Revoke active assignment" loading={busy} disabled={busy} bg={C.red600} py={11} onPress={()=>revoke(r)}/>}
        </Card>)}
      </>}
      <View style={{flexDirection:'row',gap:8,alignItems:'flex-start',padding:12}}><ShieldAlert color={C.slate500} size={18}/><T s={11} c={C.slate500} style={{flex:1}}>Physical RFID scans must be recorded by the registered reader at the gate. This mobile workspace does not impersonate hardware or create synthetic access events.</T></View>
    </View>
  </Frame>;
}
