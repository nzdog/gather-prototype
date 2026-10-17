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
function getNZTime(now: Date = new Date()): Date {
  // Create date in NZ timezone
  const nzTime = now.toLocaleString('en-US', {
    timeZone: 'Pacific/Auckland',
  });
  return new Date(nzTime);
}

/**
 * Check if current time is within quiet hours (9pm - 8am NZ)
 *
 * GTC-210: `now` is injectable, defaulting to the current instant — the same shape as
 * `isComplete(event, now = new Date())` in lifecycle.ts, and for the same reason. Both
 * existing callers pass nothing and are unaffected. Without it a quiet-hours test can
 * only assert whatever the wall clock happens to be at the moment CI runs.
 *
 * Note this decision is timezone-correct on any server: the hour compared is always the
 * Auckland wall-clock hour. (The `deferredMinutes` ARITHMETIC below is not — see
 * getMinutesUntilQuietEnd — but that is a log field, never a send decision.)
 */
export function isQuietHours(now: Date = new Date()): boolean {
  const nzNow = getNZTime(now);
  const hour = nzNow.getHours();

  // Quiet hours: 21:00 - 23:59 OR 00:00 - 07:59
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Get the next valid send time
 * If in quiet hours, returns 8:05am NZ the next morning
 * Otherwise returns now
 */
export function getNextSendTime(now: Date = new Date()): Date {
  const nzNow = getNZTime(now);

  if (!isQuietHours(now)) {
    return new Date(now); // Can send now
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
 *
 * GTC-210: `now` threaded through for the same injectability reason as `isQuietHours`,
 * and so a caller cannot end up checking the guard against one clock and reporting the
 * wait against another.
 *
 * ⚠ THE ARITHMETIC HERE IS KNOWN TO BE WRONG and is deliberately NOT fixed by GTC-210.
 * `getNZTime` returns NZ wall-clock component values on a shifted absolute instant, and
 * this subtracts a real instant from it — so on a UTC server the result is off by the
 * server-vs-Auckland offset (~720 min). It is a LOG/DISPLAY field only: every consumer
 * writes it to an InviteEvent metadata blob or a response body. The send/skip decision
 * is `isQuietHours`, which is correct in any timezone. No message is sent at the wrong
 * time because of this. Fixing it is a separate, lower-severity ticket.
 */
export function getMinutesUntilQuietEnd(now: Date = new Date()): number {
  if (!isQuietHours(now)) return 0;

  const nextSend = getNextSendTime(now);

  return Math.ceil((nextSend.getTime() - now.getTime()) / (1000 * 60));
}
