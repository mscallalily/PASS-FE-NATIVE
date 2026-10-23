/** PASS web VehicleRelease parity. Never release a vehicle without owner authorization
 * and in-person staff checks; backend records the actual exit atomically. */
import React, {useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,View} from 'react-native';
import {ArrowLeft,CheckSquare,RefreshCcw,ShieldCheck,Square} from 'lucide-react-native';
import {api} from '../api/client';
import {useAuth} from '../context/AuthContext';
import {Btn,Card,Field,Frame,T} from '../components/ui';
import {C} from '../theme';
import {NavyHeader} from './shared';
import {manilaDateTime} from '../services/rfid';

type Release = {release_id:number;transaction_id:number;plate_number:string;driver_name:string;driver_contact:string;license_reference:string;license_expiry:string;reason:string;status:string;expires_at:string;reviewed_by:number|null;released_by:number|null;released_at:string|null;review_remarks:string|null};
type Session={transaction_id:number;plate_number:string};
type Data={data:Release[];sessions:Session[];can_manage:boolean};
const empty={transaction_id:'',driver_name:'',driver_contact:'',license_number:'',license_expiry:'',reason:''};
function Info({label,value}:{label:string;value?:string|number|null}){return <View style={{gap:2,paddingVertical:5}}><T s={11} c={C.slate500}>{label}</T><T s={13} c={C.navy} w="medium">{value===undefined||value===null||value===''?'—':String(value)}</T></View>}
function CheckRow({label,checked,onPress}:{label:string;checked:boolean;onPress:()=>void}){return <Pressable accessibilityRole="checkbox" accessibilityState={{checked}} onPress={onPress} style={{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:9}}>{checked?<CheckSquare size={20} color={C.royal}/>:<Square size={20} color={C.slate400}/>}<T s={12} c={C.slate700} style={{flex:1}}>{label}</T></Pressable>}

export default function VehicleReleaseScreen({back}:{back:()=>void}){
  const {token,user}=useAuth();
  const regular=['student','faculty','employee'].includes(user?.role??'');
  const allowed=regular || ['admin','parking_staff'].includes(user?.role??'');
  const [result,setResult]=useState<Data>({data:[],sessions:[],can_manage:false});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [create,setCreate]=useState(false),[form,setForm]=useState(empty),[ack,setAck]=useState(false);
  const [selected,setSelected]=useState<Release|null>(null),[remarks,setRemarks]=useState('');
  const [identity,setIdentity]=useState(false),[authorization,setAuthorization]=useState(false);
  const load=useCallback(async()=>{
    if(!token||!allowed)return;
    setLoading(true);setError('');
    try{setResult(await api<Data>('/vehicle-releases',{token}));}
    catch(e){setError(e instanceof Error?e.message:'Unable to load emergency releases.');}
    finally{setLoading(false);}
  },[token,allowed]);
  useEffect(()=>{void load();},[load]);
  const act=async(action:'reject'|'cancel'|'release')=>{
    if(!token||!selected||busy)return;
    setBusy(true);setError('');setMessage('');
    try{const r=await api<{message:string}>(`/vehicle-releases/${selected.release_id}/action`,{token,method:'POST',json:{action,remarks,identity_checked:identity,authorization_checked:authorization}});setMessage(r.message);setSelected(null);await load();}
    catch(e){setError(e instanceof Error?e.message:'Action failed.');}
    finally{setBusy(false);}
  };
  const confirm=(action:'reject'|'cancel'|'release')=>Alert.alert('Confirm emergency release action',
    action==='release'?'This will record a real exit and release the parking slot. Verify the physical driver, license and owner authorization first.':`Confirm ${action} of this release request?`,[
      {text:'Go back',style:'cancel'},
      {text:action==='release'?'Record exit':action==='reject'?'Reject':'Cancel',style:action==='release'?'default':'destructive',onPress:()=>void act(action)}
    ]);
  const submit=async()=>{
    if(!token||busy)return;
    if(!ack||!form.transaction_id||form.driver_name.trim().length<3||form.driver_contact.trim().length<7||!(/^[A-Za-z0-9 -]{6,30}$/.test(form.license_number.trim()))||!/^\d{4}-\d{2}-\d{2}$/.test(form.license_expiry)||form.reason.trim().length<10){Alert.alert('Complete details','Provide the parked vehicle, substitute driver, valid license details, reason and owner acknowledgment.');return;}
    Alert.alert('Authorize substitute driver?','This authorizes one exit for the named driver only. PASS staff must inspect their original physical license.',[
      {text:'Cancel',style:'cancel'},
      {text:'Submit request',onPress:()=>{void (async()=>{
        setBusy(true);setError('');setMessage('');
        try{const r=await api<{message:string}>('/vehicle-releases',{token,method:'POST',json:{...form,transaction_id:Number(form.transaction_id),acknowledged:true}});setMessage(r.message);setCreate(false);setForm(empty);setAck(false);await load();}
        catch(e){setError(e instanceof Error?e.message:'Request failed.');}
        finally{setBusy(false);}
      })();}}
    ]);
  };
  const open=(r:Release)=>{setSelected(r);setIdentity(false);setAuthorization(false);setRemarks('');setError('');};
  if(!token||!allowed)return <Frame><Card><T s={14} c={C.red700}>Your account cannot access emergency vehicle release.</T></Card></Frame>;
  return <Frame topInset={false} bottomPad={100} refreshing={loading} onRefresh={()=>void load()}>
    <NavyHeader pb={28}><Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{flexDirection:'row',gap:8,alignItems:'center',marginBottom:15}}><ArrowLeft size={16} color={C.blue200}/><T s={13} c={C.blue200}>Back</T></Pressable><T s={22} w="head" c={C.white}>Emergency Vehicle Release</T><T s={12} c={C.blue200}>One session · one authorized exit</T></NavyHeader>
    <View style={{padding:16,gap:14}}>
      <Card bg={C.blue50} style={{gap:8}}><View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ShieldCheck color={C.royal} size={20}/><T s={14} w="semibold" c={C.navy}>Owner-approved substitute driver</T></View><T s={12} c={C.slate600}>The owner submits a 2-hour authorization for an active parking session. On-duty staff checks the actual driver, original license and vehicle plate before recording a single exit. No RFID or permanent access is transferred.</T></Card>
      {message!==''&&<Card bg={C.green50}><T s={12} c={C.green700}>{message}</T></Card>}
      {error!==''&&<Card bg={C.red50} border={C.red200}><T s={12} c={C.red700}>{error}</T></Card>}
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><T s={16} w="semibold" c={C.navy}>Release requests</T><Pressable accessibilityRole="button" accessibilityLabel="Refresh releases" onPress={()=>void load()} style={{padding:9}}><RefreshCcw size={20} color={C.royal}/></Pressable></View>
      {loading&&<ActivityIndicator color={C.royal}/>}
      {!loading&&!result.data.length&&<Card><T s={13} c={C.slate600}>No emergency release requests are recorded.{regular&&!result.sessions.length?' You must have a vehicle currently inside to request one.':''}</T></Card>}
      {result.data.map(row=><Card key={row.release_id} style={{gap:8}}><View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><View style={{flex:1}}><T s={16} w="bold" c={C.navy}>{row.plate_number}</T><T s={12} c={C.slate600}>Substitute: {row.driver_name}</T></View><View style={{padding:7,borderRadius:10,backgroundColor:row.status==='pending'?C.amber50:row.status==='used'?C.green50:C.slate100,alignSelf:'flex-start'}}><T s={11} c={C.navy} w="semibold">{row.status.replace(/_/g,' ')}</T></View></View><T s={11} c={C.slate500}>Request #{row.release_id} · Expires {manilaDateTime(row.expires_at)}</T><Btn label="View authorization" onPress={()=>open(row)} bg={C.navy} py={10}/></Card>)}
      {regular&&!selected&&<Card style={{gap:12}}>
        <Btn label={create?'Hide authorization form':'Authorize another driver'} disabled={!result.sessions.length} onPress={()=>{setCreate(v=>!v);setError('');}} py={11}/>
        {create&&<>
          <T s={13} w="semibold" c={C.navy}>Currently parked vehicle</T>
          {result.sessions.map(s=><Pressable key={s.transaction_id} accessibilityRole="radio" accessibilityState={{checked:form.transaction_id===String(s.transaction_id)}} onPress={()=>setForm(f=>({...f,transaction_id:String(s.transaction_id)}))} style={{padding:11,borderRadius:10,borderWidth:1,borderColor:form.transaction_id===String(s.transaction_id)?C.royal:C.slate200}}><T s={13} c={C.navy}>{form.transaction_id===String(s.transaction_id)?'◉ ':'○ '}{s.plate_number} · session #{s.transaction_id}</T></Pressable>)}
          {([{key:'driver_name',label:'Substitute driver full name'},{key:'driver_contact',label:'Driver contact number'},{key:'license_number',label:'Physical license number'},{key:'license_expiry',label:'License expiration (YYYY-MM-DD)'},{key:'reason',label:'Emergency reason'}] as const).map(item=><Field key={item.key} label={item.label} value={form[item.key]} maxLength={item.key==='reason'?1000:item.key==='license_expiry'?10:undefined} onChangeText={value=>setForm(f=>({...f,[item.key]:value}))} multiline={item.key==='reason'} autoCorrect={false}/>)}
          <CheckRow checked={ack} onPress={()=>setAck(v=>!v)} label="I am this vehicle's owner and authorize the named substitute driver to exit for this parking session only."/>
          <Btn label="Submit for staff review" loading={busy} disabled={!ack||!form.transaction_id} onPress={()=>void submit()}/>
        </>}
      </Card>}
      {selected&&<Card style={{gap:9}}>
        <T s={17} w="bold" c={C.navy}>Review request #{selected.release_id}</T><Info label="Status" value={selected.status.replace(/_/g,' ')}/><Info label="Vehicle" value={selected.plate_number}/><Info label="Substitute driver" value={selected.driver_name}/><Info label="Contact" value={selected.driver_contact}/><Info label="License reference" value={selected.license_reference}/><Info label="License expiration" value={selected.license_expiry}/><Info label="Reason" value={selected.reason}/><Info label="Owner authorization" value="Submitted by the signed-in vehicle owner"/><Info label="Expires" value={manilaDateTime(selected.expires_at)}/><Info label="Reviewed by staff" value={selected.reviewed_by}/><Info label="Released by staff" value={selected.released_by}/><Info label="Released at" value={manilaDateTime(selected.released_at)}/><Info label="Review notes" value={selected.review_remarks}/>
        {result.can_manage&&['pending','approved'].includes(selected.status)&&<>
          <CheckRow checked={identity} onPress={()=>setIdentity(v=>!v)} label="I physically inspected the substitute driver's face, original license number and expiration, and verified the vehicle plate."/>
          {selected.status==='pending'&&<CheckRow checked={authorization} onPress={()=>setAuthorization(v=>!v)} label="I checked this authorization was submitted by the vehicle owner in PASS."/>}
          <Field label="Staff review remarks or rejection reason" value={remarks} onChangeText={setRemarks} multiline/>
          {selected.status==='pending'&&<Btn label="Verify and record exit" loading={busy} disabled={!identity||!authorization} onPress={()=>confirm('release')}/>}
          {selected.status==='pending'&&<Btn label="Reject release request" bg={C.red600} py={11} disabled={busy||remarks.trim().length<5} onPress={()=>confirm('reject')}/>}
        </>}
        {['pending','approved'].includes(selected.status)&&<Btn label="Cancel authorization" bg={C.slate600} py={11} disabled={busy} onPress={()=>confirm('cancel')}/>}
        <Btn label="Close request" bg={C.white} color={C.navy} border={C.slate200} py={11} onPress={()=>{setSelected(null);setError('');}}/>
      </Card>}
    </View>
  </Frame>;
}
