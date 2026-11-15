import React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import ParkingMapScreen from '../src/screens/ParkingMapScreen';
import { HomeScreen } from '../src/screens/MainScreens';
import { api } from '../src/api/client';
import { useParkingSnapshot } from '../src/hooks/useParkingSnapshot';
import { slotColors, type ParkingMapData } from '../src/services/parkingMap';
import geometryFixture from './webMeasuredFixture.json';

let mockRole = 'student';
const mockGate = { state: { busy: false, pending: false, reviewing: false }, begin: jest.fn(), approved: jest.fn(), failed: jest.fn(), finish: jest.fn() };
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ token: 'ui-token', user: { id: 1, name: 'Fixture User', role: mockRole } }) }));
jest.mock('../src/context/LicenseContext', () => ({ useLicense: () => ({ status: 'not_submitted' }), LICENSE_STATUS_LABEL: { not_submitted: 'Not submitted' } }));
jest.mock('../src/hooks/useParkingSnapshot', () => ({ useParkingSnapshot: jest.fn() }));
jest.mock('../src/hooks/useGateNotice', () => ({ useGateNotice: () => mockGate }));
jest.mock('../src/components/GateNoticePanel', () => { const React=require('react'), {Text}=require('react-native'); return () => React.createElement(Text,null,'Gate review notice'); });
jest.mock('../src/components/ParkingWeb3DNative', () => {
  const React=require('react'), {Pressable,Text,View}=require('react-native');
  return ({data,onSelect}: any) => React.createElement(View,null,
    ...data.slots.map((s:any)=>React.createElement(Pressable,{key:s.slot_id,onPress:()=>onSelect(s),accessibilityRole:'button',accessibilityLabel:'Select '+s.slot_code},React.createElement(Text,null,s.slot_code))));
});
jest.mock('../src/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {} }));
jest.mock('../src/services/history', () => ({ getParkingHistory: jest.fn(async () => []) }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({top:0,bottom:0,left:0,right:0}) }));

function fixture(): ParkingMapData {
  const area={parking_area_id:1,area_code:'MC',area_name:'Motorcycles',capacity:2,available:0,occupied:1,maintenance:0,sensor_unavailable:1,unverified_occupied:1,recorded_occupied:0};
  const slot={parking_area_id:1,area_code:'MC',area_name:'Motorcycles',slot_status:'available',placed:true,x:10,y:12,w:5,h:9,rotation:0,recorded_occupied:false};
  return {view_box:[0,0,120,100],geometry:geometryFixture.geometry as unknown as ParkingMapData['geometry'],extra_bays:[],areas:[area],overall:area,generated_at:'2026-11-09T01:00:00Z',hasStaffDetails:false,
    slots:[{...slot,slot_id:1,slot_code:'M-01',status:'unknown',sensor:{online:false,state:'offline',distance_cm:null,last_seen_at:'2026-11-09T00:59:40Z'}},
      {...slot,slot_id:2,slot_code:'M-02',status:'occupied',sensor:{online:true,state:'occupied',distance_cm:10,last_seen_at:'2026-11-09T01:00:00Z'}}]};
}
function response(data=fixture(), fresh=true, error='') { return {data,fresh,error,loading:false,refresh:jest.fn(async()=>{})}; }
beforeEach(() => {
  mockRole='student';(useParkingSnapshot as jest.Mock).mockReturnValue(response());
  (api as jest.Mock).mockReset().mockResolvedValue({data:[]});
  Object.assign(mockGate.state,{busy:false,pending:false,reviewing:false});
  for(const method of ['begin','approved','failed','finish'] as const)mockGate[method].mockReset();
  mockGate.begin.mockReturnValue({id:1});
});
afterEach(async () => { await cleanup();jest.restoreAllMocks(); });

test('unknown mapped slots are amber and explain sensor uncertainty without exposing staff actions', async () => {
  await render(<ParkingMapScreen/>);
  expect(slotColors(fixture().slots[0]).fill).toBe('#F59E0B');
  expect(screen.getByText('Sensor unavailable')).toBeTruthy();
  expect(screen.getByText('1 occupied · 0 maintenance · 1 sensor unavailable')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Select M-01'));
  expect(screen.getByText('SENSOR UNAVAILABLE')).toBeTruthy();
  expect(screen.getByText(/offline or uncertain/)).toBeTruthy();
  expect(screen.queryByText('Confirm vehicle in assigned slot')).toBeNull();
});

test('a detected object remains unverified and cannot become an identity-confirmation action', async () => {
  mockRole='security';const data=fixture();data.hasStaffDetails=true;
  (useParkingSnapshot as jest.Mock).mockReturnValue(response(data));
  await render(<ParkingMapScreen/>);await fireEvent.press(screen.getByLabelText('Select M-02'));
  expect(screen.getByText(/Sensor detected an object/)).toBeTruthy();
  expect(screen.getByText(/no parking entry is created by this reading/)).toBeTruthy();
  expect(screen.queryByText('Confirm vehicle in assigned slot')).toBeNull();
});

test('a public slot detail never renders an accidentally supplied private occupant', async () => {
  const data=fixture();data.slots[1]={...data.slots[1],recorded_occupied:true,occupant:{transaction_id:55,plate_number:'PRIVATE-PLATE',vehicle_type:'Sedan',party_type:'user',party_name:'Private Owner',owner_code:'PRIVATE-ID',access_method:'rfid',entry_datetime:null,confirmed:false,confirmed_at:null}};
  (useParkingSnapshot as jest.Mock).mockReturnValue(response(data));
  await render(<ParkingMapScreen/>);await fireEvent.press(screen.getByLabelText('Select M-02'));
  expect(screen.queryByText('PRIVATE-PLATE')).toBeNull();expect(screen.queryByText('Private Owner')).toBeNull();
  expect(screen.queryByText('Confirm vehicle in assigned slot')).toBeNull();
  await fireEvent.press(screen.getByText('Plan View'));
  expect(screen.queryByText('PRIVATE-PLATE')).toBeNull(); expect(screen.queryByText('Private Owner')).toBeNull();
});

test('expired/error availability does not keep a selectable green map or old counts', async () => {
  const view=await render(<ParkingMapScreen/>);expect(screen.getByLabelText('Select M-01')).toBeTruthy();
  (useParkingSnapshot as jest.Mock).mockReturnValue(response(fixture(),false,'API offline'));
  await view.rerender(<ParkingMapScreen/>);
  expect(screen.queryByLabelText('Select M-01')).toBeNull();
  expect(screen.queryByText('1 occupied · 0 maintenance · 1 sensor unavailable')).toBeNull();
  expect(screen.getByText(/API offline/)).toBeTruthy();
});

test('Home uses snapshot sensor counts and hides retained green availability after a failure', async () => {
  const user={id:'1',name:'Fixture User',email:'fixture@example.test',role:'student' as const};
  const view=await render(<HomeScreen user={user} onNavigate={()=>{}}/>);
  expect(screen.getByText('0 slots')).toBeTruthy();expect(screen.getByText(/1 mapped sensor slots are offline or uncertain/)).toBeTruthy();
  expect(screen.getByText(/1 occupancy detections have no recorded slot assignment/)).toBeTruthy();
  (useParkingSnapshot as jest.Mock).mockReturnValue(response(fixture(),false,'API offline'));
  await view.rerender(<HomeScreen user={user} onNavigate={()=>{}}/>);
  expect(screen.queryByText('0 slots')).toBeNull();expect(screen.queryByText('Motorcycles')).toBeNull();expect(screen.getByText('Unavailable')).toBeTruthy();
});

test('two pending confirmation dialogs cannot submit a gate action twice', async () => {
  mockRole='security';const data=fixture();data.hasStaffDetails=true;(useParkingSnapshot as jest.Mock).mockReturnValue(response(data));
  const dialog=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
  const pending=new Promise(()=>{});(api as jest.Mock).mockImplementation((path:string)=>path==='/parking/entry'?pending:Promise.resolve({data:[]}));
  mockGate.begin.mockReturnValueOnce({id:1}).mockImplementationOnce(()=>{throw new Error('Gate action already pending');});
  await render(<ParkingMapScreen/>);await fireEvent.press(screen.getByText('Main Entrance / Exit controls'));
  await fireEvent.changeText(screen.getByLabelText('Gate credential'),'TEST-UID');
  await fireEvent.press(screen.getByLabelText('Record vehicle entry'));await fireEvent.press(screen.getByLabelText('Record vehicle entry'));
  const proceed=dialog.mock.calls.map(call=>call[2]?.find(button=>button.text==='Proceed')?.onPress).filter(Boolean);
  expect(proceed).toHaveLength(2);
  await act(async()=>{proceed[0]!();proceed[1]!();});
  expect((api as jest.Mock).mock.calls.filter(call=>call[0]==='/parking/entry')).toHaveLength(1);
});
