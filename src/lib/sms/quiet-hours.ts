/**
 * NZ Quiet Hours: 9pm - 8am
 * During these hours, we defer sending to 8:05am the next day
 */

const QUIET_START_HOUR = 21; // 9pm
const QUIET_END_HOUR = 8; // 8am
const DEFER_TO_MINUTE = 5; // 8:05am

/**
 * Get current time in NZ timezone
 */
function getNZTime(): Date {
  // Create date in NZ timezone
  const nzTime = new Date().toLocaleString('en-US', {
    timeZone: 'Pacific/Auckland',
  });
  return new Date(nzTime);
}

/**
 * Check if current time is within quiet hours (9pm - 8am NZ)
 */
export function isQuietHours(): boolean {
  const nzNow = getNZTime();
  const hour = nzNow.getHours();

  // Quiet hours: 21:00 - 23:59 OR 00:00 - 07:59
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Get the next valid send time
 * If in quiet hours, returns 8:05am NZ the next morning
 * Otherwise returns now
 */
export function getNextSendTime(): Date {
  const nzNow = getNZTime();

  if (!isQuietHours()) {
    return new Date(); // Can send now
  }

  // Calculate 8:05am NZ
  const nextSend = new Date(nzNow);

  if (nzNow.getHours() >= QUIET_START_HOUR) {
    // It's evening (9pm-midnight), defer to tomorrow 8:05am
    nextSend.setDate(nextSend.getDate() + 1);
  }
  // If it's early morning (midnight-8am), defer to today 8:05am

  nextSend.setHours(QUIET_END_HOUR, DEFER_TO_MINUTE, 0, 0);

  return nextSend;
}

/**
 * Check if a specific time is within quiet hours
 */
export function isTimeInQuietHours(date: Date): boolean {
  const nzTime = new Date(
    date.toLocaleString('en-US', {
      timeZone: 'Pacific/Auckland',
    })
  );
  const hour = nzTime.getHours();

  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Get minutes until quiet hours end (for logging/display)
 */
export function getMinutesUntilQuietEnd(): number {
  if (!isQuietHours()) return 0;

  const nextSend = getNextSendTime();
  const now = new Date();

  return Math.ceil((nextSend.getTime() - now.getTime()) / (1000 * 60));
}
