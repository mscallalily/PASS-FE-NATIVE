type DepartmentOption = { department_code?: string | null; department_name?: string | null };

/** Mirrors the category filter; the backend remains authoritative at submission. */
export function isCollegeDepartment(department: DepartmentOption): boolean {
  const normalize = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().toUpperCase() : '';
  const code = normalize(department.department_code), name = normalize(department.department_name);
  return !!code && !!name && !['SHS', 'JHS', 'BED'].includes(code)
    && !['SECURITY OFFICE', 'HR DEPARTMENT', 'IT DEPARTMENT', 'REGISTRAR OFFICE'].includes(name);
}
