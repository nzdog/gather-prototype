/**
 * Creates a UTC Date from NZ local date and time.
 *
 * ⚠️  WARNING: THIS HELPER IS NZDT-SPECIFIC (UTC+13)
 * ⚠️  It is ONLY valid for dates in NZ Daylight Saving Time.
 * ⚠️  For December 2025, this is correct. For other dates, verify offset.
 *
 * If reusing this for events outside NZDT (April–September in NZ),
 * you MUST use NZST (UTC+12) instead. Do not use this function blindly.
 *
 * @param dateStr - Date in "YYYY-MM-DD" format (NZ local)
 * @param timeStr - Time in "HH:mm" 24-hour format (NZ local)
 * @returns Date object representing that NZ local time as UTC
 */
export function makeNzdtChristmas2025Date(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // NZDT offset: UTC+13 (valid for Christmas 2025)
  const nzdtOffsetMinutes = 13 * 60;

  // Create a date in UTC that represents this NZ local time
  const utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const adjusted = new Date(utc - nzdtOffsetMinutes * 60 * 1000);

  return adjusted;
}

// Examples (verify these in implementation):
// makeNzdtChristmas2025Date("2025-12-24", "17:30") → 2025-12-24T04:30:00.000Z (5:30pm NZ)
// makeNzdtChristmas2025Date("2025-12-25", "12:00") → 2025-12-24T23:00:00.000Z (12 noon NZ)
// makeNzdtChristmas2025Date("2025-12-25", "10:00") → 2025-12-24T21:00:00.000Z (10am NZ)
