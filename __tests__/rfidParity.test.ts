import { accessEventQuery, assignmentIssue, campusToday, DEFAULT_GATE_FILTERS, eligibleVehicles, filterCredentials, type RfidCredential } from '../src/services/rfid';
import { MODULES, canAccessModule } from '../src/permissions';

describe('RFID web parity', () => {
  it('defaults gate records to RFID scans and uses web-supported query keys', () => {
    expect(accessEventQuery(DEFAULT_GATE_FILTERS)).toBe('/access-events?method=rfid');
    expect(accessEventQuery({method:'',direction:'in',result:'denied',date:'today',search:'ABC 123'}))
      .toBe('/access-events?direction=in&result=denied&date=today&search=ABC%20123');
  });
  it('filters credentials by tag/user/plate, not simulated status', () => {
    const row={rfid_id:1,tag_uid:'TAG-123',user_code:'S001',user_name:'Alex',plate_number:'ABC-123',tag_type:'sticker',tag_status:'assigned',assignment_id:12,assignment_status:'active',assigned_at:null,valid_until:null,expired:false,user_type:'student',last_used:null} as RfidCredential;
    expect(filterCredentials([row],'tag-123')).toHaveLength(1);
    expect(filterCredentials([row],'abc-123')).toHaveLength(1);
    expect(filterCredentials([row],'not-present')).toHaveLength(0);
  });
  it('lists only approved vehicles without active RFID credentials for assignment', () => {
    expect(eligibleVehicles([{id:'1',plate:'A',owner:'Alex',authorizationStatus:'approved',rfid:null},{id:'2',plate:'B',owner:'Bea',authorizationStatus:'approved',rfid:'TAG'},{id:'3',plate:'C',owner:'Cal',authorizationStatus:'pending',rfid:null}]).map(v=>v.id)).toEqual(['1']);
  });
  it('validates uid/date before server ownership and license eligibility', () => {
    expect(assignmentIssue('TAG-001','22','','2026-10-23')).toBeNull();
    expect(assignmentIssue('tag 001','22','','2026-10-23')).toMatch(/UID/);
    expect(assignmentIssue('TAG-001','0','','2026-10-23')).toMatch(/vehicle/);
    expect(assignmentIssue('TAG-001','22','2026-10-22','2026-10-23')).toMatch(/date/);
    expect(assignmentIssue('TAG-001','22','2026-02-30','2026-01-01')).toMatch(/date/);
  });
  it('uses Manila campus date when validating RFID expiry',()=>{
    expect(campusToday(new Date('2026-10-22T18:00:00Z'))).toBe('2026-10-23');
  });
  it('uses backend-authorized RFID views without granting students or guests credentials access', () => {
    expect(MODULES.rfid.endpoint).toBe('/rfid/assignments');
    expect(canAccessModule('admin','rfid')).toBe(true);
    expect(canAccessModule('parking_staff','rfid')).toBe(true);
    expect(canAccessModule('student','rfid')).toBe(false);
    expect(canAccessModule('guest','rfid')).toBe(false);
  });
});
