/** Age in whole years from an ISO date, or null. Pure. */
export function ageYears(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
