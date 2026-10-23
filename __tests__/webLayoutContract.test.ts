import { verifyWebMeasuredLayout, withMeasuredLayout, type ParkingMapData } from '../src/services/parkingMap';
import webMeasured from './webMeasuredFixture.json';

// Fixture exported verbatim by invoking the WEB BACKEND ParkingMapLayout::measuredLayout().
// Do not alter positions or regroup rows in mobile: the exact source is Laravel.
const makeData = (): ParkingMapData => ({
  view_box:[35,-15,740,380],
  geometry: webMeasured.geometry as unknown as ParkingMapData['geometry'],
  measured_layout: webMeasured as unknown as ParkingMapData['measured_layout'],
  extra_bays:[],
  slots:[...Object.keys(webMeasured.positions), ...Array.from({length:10},(_,i)=>`C-${i+46}`)].map((code,id)=>({
    slot_id:id+1,slot_code:code,parking_area_id:code.startsWith('M')?2:1,
    area_code:code.startsWith('M')?'MC':'CAR',area_name:code.startsWith('M')?'Motorcycles':'Cars',
    slot_status:'available',status:'available',placed:false,x:null,y:null,w:null,h:null,rotation:0,
  })),
});

describe('exact PASS web measured-layout contract',()=>{
  it('uses every web bay exactly once, preserving exact coordinates and numbering',()=>{
    const raw=makeData();
    expect(verifyWebMeasuredLayout(raw)).toEqual({MC:84,CAR:45,unmappedCars:10});
    const actual=withMeasuredLayout(raw);
    expect(actual.slots.filter(s=>s.placed&&s.area_code==='MC')).toHaveLength(84);
    expect(actual.slots.filter(s=>s.placed&&s.area_code==='CAR')).toHaveLength(45);
    for(let i=1;i<=84;i++) {
      const code=`M-${String(i).padStart(2,'0')}`;
      const slot=actual.slots.find(s=>s.slot_code===code)!;
      expect({x:slot.x,y:slot.y,w:slot.w,h:slot.h,rotation:slot.rotation}).toEqual(webMeasured.positions[code as keyof typeof webMeasured.positions]);
    }
    for(let i=1;i<=45;i++) {
      const code=`C-${String(i).padStart(2,'0')}`;
      const slot=actual.slots.find(s=>s.slot_code===code)!;
      expect({x:slot.x,y:slot.y,w:slot.w,h:slot.h,rotation:slot.rotation}).toEqual(webMeasured.positions[code as keyof typeof webMeasured.positions]);
    }
    expect(actual.slots.filter(s=>!s.placed).map(s=>s.slot_code)).toEqual(Array.from({length:10},(_,i)=>`C-${i+46}`));
  });
  it('rejects partial parking API data instead of quietly removing slots',()=>{
    const data=makeData();data.slots=data.slots.filter(s=>s.slot_code!=='M-84');
    expect(()=>verifyWebMeasuredLayout(data)).toThrow('M-84 exists in the PASS Web layout');
    const data2=makeData();data2.slots=data2.slots.filter(s=>s.slot_code!=='C-45');
    expect(()=>verifyWebMeasuredLayout(data2)).toThrow('C-45 exists in the PASS Web layout');
  });
  it('rejects reordered or truncated web geometry rather than synthesizing new coordinates',()=>{
    const data=makeData();
    delete data.measured_layout!.positions['C-42'];
    expect(()=>verifyWebMeasuredLayout(data)).toThrow('must contain 45');
  });
});
