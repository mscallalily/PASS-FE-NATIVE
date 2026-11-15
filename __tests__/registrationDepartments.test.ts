import { isCollegeDepartment } from '../src/services/registrationDepartments';

describe('college department choices', () => {
  it('excludes office aliases after normalizing case and whitespace', () => {
    for (const name of ['Security Office', 'security  office', ' HR Department ', 'IT\tDepartment', 'Registrar\u00A0Office']) {
      expect(isCollegeDepartment({ department_code: 'OFF', department_name: name })).toBe(false);
    }
  });
  it('excludes school levels and incomplete records', () => {
    for (const code of ['SHS', ' shs ', 'JHS', 'BED', '']) expect(isCollegeDepartment({ department_code: code, department_name: 'Example unit' })).toBe(false);
    expect(isCollegeDepartment({})).toBe(false);
    expect(isCollegeDepartment({ department_code: 'COE', department_name: '  ' })).toBe(false);
  });
  it('preserves actual college names without guessing by substring', () => {
    for (const name of ['Engineering', 'Information Technology', 'IT Department Studies', 'Security Office Research College']) {
      expect(isCollegeDepartment({ department_code: 'COE', department_name: name })).toBe(true);
    }
  });
});
