import { ageParkingMap, getParkingMap, hasRecordedHold, slotColors, type MapSlot, type ParkingMapData } from '../src/services/parkingMap';
import { getParkingAvailability, getParkingAvailabilitySnapshot } from '../src/services/parking';
import { parseParkingMapResponse } from '../src/services/parkingAvailability';
import webMeasured from './webMeasuredFixture.json';

function fixture(): ParkingMapData {
  const slots: MapSlot[] = [...Object.keys(webMeasured.positions), ...Array.from({length:10},(_,i)=>`C-${i+46}`)].map((code,i)=>({
    slot_id:i+1,slot_code:code,parking_area_id:code.startsWith('M')?2:1,area_code:code.startsWith('M')?'MC':'CAR',area_name:code.startsWith('M')?'Motorcycles':'Cars',
    slot_status:'available',status:'available',placed:false,x:null,y:null,w:null,h:null,rotation:0,recorded_occupied:false,
  }));
  for (const code of ['C-01','C-02','C-03','C-04']) {
    const slot=slots.find(s=>s.slot_code===code)!;
    slot.sensor={online:true,state:'available',distance_cm:30,last_seen_at:'2026-11-06T00:00:00Z'};
  }
  const second=slots.find(s=>s.slot_code==='C-02')!,third=slots.find(s=>s.slot_code==='C-03')!,fourth=slots.find(s=>s.slot_code==='C-04')!;
  second.status='occupied';second.sensor={...second.sensor!,state:'occupied',distance_cm:10};
  third.status='occupied';third.recorded_occupied=true;third.sensor={...third.sensor!,state:'occupied',distance_cm:10};
  fourth.status='maintenance';fourth.slot_status='maintenance';
  return { view_box:[35,-15,740,380],geometry:webMeasured.geometry as unknown as ParkingMapData['geometry'],
    measured_layout:webMeasured as unknown as ParkingMapData['measured_layout'],extra_bays:[],slots,generated_at:'2026-11-06T00:00:01Z',
    areas:[{parking_area_id:1,area_code:'CAR',area_name:'Cars',capacity:55,occupied:2,available:52,maintenance:1,recorded_occupied:1,unverified_occupied:1,sensor_unavailable:0},
      {parking_area_id:2,area_code:'MC',area_name:'Motorcycles',capacity:84,occupied:0,available:84,maintenance:0,recorded_occupied:0,unverified_occupied:0,sensor_unavailable:0}],
    overall:{capacity:139,occupied:2,available:136,maintenance:1,recorded_occupied:1,unverified_occupied:1,sensor_unavailable:0} };
}
const response=(data:unknown,status=200)=>({ok:status<400,status,json:async()=>data});
beforeEach(()=>{(global as any).fetch=jest.fn();});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
const byCode=(data:ParkingMapData,code:string)=>data.slots.find(s=>s.slot_code===code)!;

describe('hardware-aware parking service contracts',()=>{
  it('parses numeric string flags without turning zero into a healthy or held slot',()=>{
    const f:any=fixture(),s=f.slots.find((slot:any)=>slot.slot_code==='C-01');
    Object.assign(s,{slot_id:String(s.slot_id),parking_area_id:'1',placed:'0',recorded_occupied:'0',accessible:'0'});
    s.sensor.online='1';s.sensor.distance_cm='30.50';f.overall.available='136';
    const parsed=parseParkingMapResponse(f,false),slot=byCode(parsed,'C-01');
    expect(slot).toMatchObject({placed:false,recorded_occupied:false,accessible:false,sensor:{online:true,distance_cm:30.5}});
    expect(hasRecordedHold(slot)).toBe(false);expect(parsed.overall!.available).toBe(136);
  });

  it.each([
    (f:any)=>{f.slots[0].placed='false';},
    (f:any)=>{f.slots[0].status='healthy';},
    (f:any)=>{f.slots[0].slot_id=0;},
    (f:any)=>{f.overall.available=NaN;},
    (f:any)=>{f.overall.available=false;},
    (f:any)=>{(byCode(f,'C-01').sensor as any).distance_cm=0;},
    (f:any)=>{(byCode(f,'C-01').sensor as any).online='false';},
    (f:any)=>{delete byCode(f,'C-01').recorded_occupied;},
    (f:any)=>{f.generated_at='invalid';},
  ])('rejects malformed availability instead of fabricating healthy values',change=>{
    const f=fixture();change(f);expect(()=>parseParkingMapResponse(f,false)).toThrow(/incomplete|inconsistent/);
  });

  it('ages all unheld sensor readings offline while retaining recorded holds, maintenance and total capacity',()=>{
    const raw=parseParkingMapResponse(fixture(),false);raw.clientRequestedAt=1000;
    const aged=ageParkingMap(raw,14000);
    expect(byCode(aged,'C-01').status).toBe('unknown');expect(byCode(aged,'C-02').status).toBe('unknown');
    expect(byCode(aged,'C-03').status).toBe('occupied');expect(hasRecordedHold(byCode(aged,'C-03'))).toBe(true);
    expect(byCode(aged,'C-04').status).toBe('maintenance');expect(byCode(aged,'M-01').status).toBe('available');
    expect(aged.overall).toMatchObject({available:135,occupied:1,maintenance:1,sensor_unavailable:2,unverified_occupied:0,recorded_occupied:1});
    expect(aged.overall!.available+aged.overall!.occupied+aged.overall!.maintenance!+aged.overall!.sensor_unavailable!).toBe(139);
    expect(slotColors(byCode(aged,'C-01')).fill).toBe('#F59E0B');expect(ageParkingMap(aged,20000).overall).toEqual(aged.overall);
    expect(byCode(raw,'C-01').status).toBe('available');
  });

  it('fails mapped readings closed when the monotonic request clock is unavailable',()=>{
    const aged=ageParkingMap(parseParkingMapResponse(fixture(),false),14000);
    expect(byCode(aged,'C-01').status).toBe('unknown');expect(byCode(aged,'C-03').status).toBe('occupied');
  });

  it('includes HTTP delay immediately on receipt of a public snapshot',async()=>{
    jest.useFakeTimers();let complete!:(value:any)=>void;
    (global.fetch as jest.Mock).mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const pending=getParkingAvailabilitySnapshot('test-token'),f=fixture();f.generated_at='2026-11-06T00:00:08Z';
    jest.advanceTimersByTime(6000);complete(response(f));const snapshot=await pending;
    expect(byCode(snapshot,'C-01').status).toBe('unknown');expect(snapshot.overall!.sensor_unavailable).toBe(2);
    expect(snapshot.hasStaffDetails).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/parking/availability-map');
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('keeps the timing of overlapping requests paired with their own responses',async()=>{
    jest.useFakeTimers();let slow!:(value:any)=>void,fast!:(value:any)=>void;
    (global.fetch as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{slow=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{fast=resolve;}));
    const first=getParkingAvailabilitySnapshot('test-token');jest.advanceTimersByTime(5500);const second=getParkingAvailabilitySnapshot('test-token');
    const f=fixture();f.generated_at='2026-11-06T00:00:08Z';jest.advanceTimersByTime(500);
    fast(response(f));const fresh=await second;slow(response(f));const stale=await first;
    expect(byCode(fresh,'C-01').status).toBe('available');expect(byCode(stale,'C-01').status).toBe('unknown');
  });

  it('strips identity fields from the public contract even if a response accidentally includes them',async()=>{
    const f:any=fixture();f.hasStaffDetails=true;(byCode(f,'C-03') as any).occupant={transaction_id:10,plate_number:'PRIVATE TEST',party_name:'Do not display'};(byCode(f,'C-03') as any).incident={plate_number:'PRIVATE TEST'};
    (global.fetch as jest.Mock).mockResolvedValue(response(f));const result=await getParkingAvailabilitySnapshot('test-token');
    expect(result.hasStaffDetails).toBe(false);expect(byCode(result,'C-03').occupant).toBeUndefined();expect(byCode(result,'C-03').incident).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE TEST');
  });

  it('only staff routes can preserve staff details and backend denial still falls back safely',async()=>{
    const f:any=fixture();byCode(f,'C-03').occupant={transaction_id:10,plate_number:'TEST 0010',vehicle_type:'Car',party_type:'user',party_name:'Test User',owner_code:'TEST',access_method:'rfid',entry_datetime:'2026-11-06T00:00:00Z',confirmed:false,confirmed_at:null};
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(f));const staff=await getParkingMap('test-token','security');
    expect(staff.hasStaffDetails).toBe(true);expect(byCode(staff,'C-03').occupant!.confirmed).toBe(false);
    (global.fetch as jest.Mock).mockResolvedValueOnce(response({message:'Forbidden'},403)).mockResolvedValueOnce(response(f));
    const fallback=await getParkingMap('test-token','security');expect(fallback.hasStaffDetails).toBe(false);expect(byCode(fallback,'C-03').occupant).toBeUndefined();
  });

  it('preserves omitted legacy aggregate fields and optional zones without fabricating zero counts',async()=>{
    const zone={zone_id:1,zone_code:'C',zone_name:'Cars',capacity:55,occupied:10,available:40,reserved:0,maintenance:5,disabled:0};
    (global.fetch as jest.Mock).mockResolvedValueOnce(response({areas:[{parking_area_id:'1',area_code:'CAR',area_name:'Cars',capacity:'55',occupied:'10',available:'40',zones:[zone]}]}));
    const areas=await getParkingAvailability('test-token');
    expect(areas[0]).toMatchObject({capacity:55,occupied:10,available:40,zones:[zone]});
    expect(areas[0].maintenance).toBeUndefined();expect(areas[0].sensor_unavailable).toBeUndefined();
  });

  it('rejects a mixed slot/count snapshot instead of allowing negative counts during expiry',()=>{
    const f=fixture();f.overall={...f.overall!,occupied:3,available:135,recorded_occupied:2};
    expect(()=>parseParkingMapResponse(f,false)).toThrow(/inconsistent/);
  });

  it('cancels in-flight public reads and does not start a request for an already-aborted signal',async()=>{
    const already=new AbortController();already.abort();
    await expect(getParkingAvailabilitySnapshot('test-token',already.signal)).rejects.toMatchObject({code:'cancelled'});
    expect(global.fetch).not.toHaveBeenCalled();
    (global.fetch as jest.Mock).mockImplementation(()=>new Promise(()=>{}));
    const controller=new AbortController(),pending=getParkingAvailabilitySnapshot('test-token',controller.signal);
    controller.abort();await expect(pending).rejects.toMatchObject({code:'cancelled'});
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('cannot start a public fallback when the privileged attempt is cancelled',async()=>{
    const controller=new AbortController();
    (global.fetch as jest.Mock).mockResolvedValue({ok:false,status:403,json:async()=>{controller.abort();return {message:'Forbidden'};}});
    await expect(getParkingMap('test-token','security',controller.signal)).rejects.toMatchObject({code:'cancelled'});
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('retains the aggregate-array API while parsing new counts, and errors remain errors',async()=>{
    (global.fetch as jest.Mock).mockResolvedValueOnce(response({areas:fixture().areas}));const areas=await getParkingAvailability('test-token');
    expect(Array.isArray(areas)).toBe(true);expect(areas[0]).toMatchObject({area_code:'CAR',unverified_occupied:1,sensor_unavailable:0});
    (global.fetch as jest.Mock).mockResolvedValueOnce(response({message:'Offline'},503));await expect(getParkingAvailabilitySnapshot('test-token')).rejects.toMatchObject({status:503});
    (global.fetch as jest.Mock).mockResolvedValueOnce(response({...fixture(),overall:undefined}));await expect(getParkingAvailabilitySnapshot('test-token')).rejects.toThrow(/invalid parking availability/);
  });
});
