import { canOperateSlots, getParkingMap, slotColors, withMeasuredLayout, type ParkingMapData } from '../src/services/parkingMap';
import webMeasured from './webMeasuredFixture.json';

const emptyMap: ParkingMapData = {
  view_box: [0, 0, 120, 100],
  geometry: {
    areas: [{area:'MC',polygon:[[0,0],[40,0],[40,80],[0,80]],label:'Motorcycles',label_at:[20,30],label_angle:0}],
    road: {polygon:[[40,0],[50,0],[50,100],[40,100]],label:'Entrance',label_at:[45,45],label_angle:0},
    gate: {at:[45,0],angle:0,label:'Gate',sublabel:'Main gate',label_at:[45,0]}, lanes:[],
  },
  slots: [{slot_id:1,slot_code:'M-01',parking_area_id:1,area_code:'MC',area_name:'Motorcycles',
    slot_status:'available',status:'available',placed:true,x:10,y:12,w:5,h:9,rotation:0}],
  extra_bays:[],
};

// The live endpoint now requires all 129 measured bays. Use the same backend-exported
// contract fixture as webLayoutContract rather than the earlier one-slot API mock.
const fullWebMap = (): ParkingMapData => ({
  ...emptyMap,
  geometry:webMeasured.geometry as unknown as ParkingMapData['geometry'],
  measured_layout:webMeasured as unknown as ParkingMapData['measured_layout'],
  slots:Object.keys(webMeasured.positions).map((code,i)=>({
    ...emptyMap.slots[0],slot_id:i+1,slot_code:code,
    area_code:code.startsWith('M-')?'MC':'CAR',
  })),
});
beforeEach(() => { (global as any).fetch=jest.fn(); });
const result = (value:unknown,status=200) => ({ok:status<400,status,json:async()=>value});

describe('shared Laravel parking layout and permissions', () => {
  it('renders precisely the measured web alternative, including unplaced inventory', () => {
    const data=withMeasuredLayout({...emptyMap,measured_layout:{geometry:emptyMap.geometry,positions:{'M-01':{x:21,y:30,w:8,h:11,rotation:4}}},
      slots:[...emptyMap.slots,{...emptyMap.slots[0],slot_id:2,slot_code:'M-02'}]});
    expect(data.slots[0]).toMatchObject({x:21,y:30,w:8,h:11,rotation:4,placed:true});
    expect(data.slots[1]).toMatchObject({placed:false,x:null,y:null,w:null,h:null});
  });

  it('keeps red occupied slots and grey maintenance with the web color rules', () => {
    expect(slotColors({...emptyMap.slots[0],status:'occupied'}).fill).toBe('#EF4444');
    expect(slotColors({...emptyMap.slots[0],status:'maintenance'}).fill).toBe('#9CA3AF');
    expect(slotColors(emptyMap.slots[0]).fill).toBe('#22C55E');
  });

  it('users and guests read only the identity-redacted availability map', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(result(fullWebMap()));
    const guest=await getParkingMap('token','guest');
    expect(guest.hasStaffDetails).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/parking/availability-map');
    expect(canOperateSlots('student')).toBe(false);
    expect(canOperateSlots('admin')).toBe(false);
  });

  it('authorized security sees privileged details but frontend does not grant new powers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(result(fullWebMap()));
    const map=await getParkingMap('token','security');
    expect(map.hasStaffDetails).toBe(true);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/parking/map');
    expect(canOperateSlots('security')).toBe(true);
    expect(canOperateSlots('parking_admin')).toBe(false);
  });

  it('a backend 403 securely falls back to the public map without exposing private records', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(result({message:'Forbidden'},403))
      .mockResolvedValueOnce(result(fullWebMap()));
    const map=await getParkingMap('token','parking_staff');
    expect(map.hasStaffDetails).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/api/parking/availability-map');
  });

  it('non-authorization failures remain errors instead of being concealed', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(result({message:'Database offline'},503));
    await expect(getParkingMap('token','parking_staff')).rejects.toMatchObject({status:503});
  });
});
