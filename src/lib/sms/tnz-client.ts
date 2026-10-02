/**
 * TNZ SMS client
 *
 * TNZ is used for NZ (+64) and AU (+61) delivery because Twilio does not
 * support NZ SMS delivery. Auth token is obtained from the TNZ Dashboard
 * (Users → API tab → Auth Token) and set via the TNZ_AUTH_TOKEN env var.
 *
 * Endpoint: POST https://api.tnz.co.nz/api/v2.04/send/sms
 * Auth:     Authorization: Basic ${TNZ_AUTH_TOKEN}  (token already encoded)
 */

import { isLiveSendingOn, LIVE_SENDS_OFF } from '@/lib/live-sends';

const TNZ_ENDPOINT = 'https://api.tnz.co.nz/api/v2.04/send/sms';

const authToken = process.env.TNZ_AUTH_TOKEN;
const isConfigured = !!authToken;

if (!isConfigured) {
  console.warn(
    '[TNZ] SMS is not configured. Set TNZ_AUTH_TOKEN (from TNZ Dashboard → Users → API tab) to enable NZ/AU SMS delivery.'
  );
}

export function isTnzEnabled(): boolean {
  return isConfigured;
}

export interface TnzSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an SMS via TNZ.
 *
 * Returns `{ success: true, messageId }` on HTTP 2xx. On any non-2xx response
 * or network failure, returns `{ success: false, error }` with a best-effort
 * description. Callers are responsible for opt-out checks and logging.
 *
 * ⚠ [[GTC-258]]: `success` MEANS TNZ ACCEPTED THE TEXT, NOT THAT IT ARRIVED. TNZ
 * answer 200 even for a number on their opt-out list, and report what happened
 * later, on their status webhook (TNZ, 2026-08-31: "you should be working from
 * delivery results and not assuming the API accepting a message means
 * successful delivery"). The `messageId` is the join key that report comes back
 * on. The field keeps its name (plan ruling Q13): renaming it would touch the
 * live-send script.
 */
export async function sendViaTnz(params: { to: string; message: string }): Promise<TnzSendResult> {
  const { to, message } = params;

  if (!authToken) {
    return { success: false, error: 'TNZ_AUTH_TOKEN not configured' };
  }

  // [[GTC-274]] — the live switch, after configuration and before the fetch. `sendSms` stops first
  // on its own gate; this one is what fences a direct caller (`scripts/test-tnz-sms.ts`).
  if (!isLiveSendingOn()) {
    return { success: false, error: LIVE_SENDS_OFF };
  }

  const payload = {
    MessageData: {
      Message: message,
      Destinations: [{ Recipient: to }],
    },
  };

  try {
    const response = await fetch(TNZ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `TNZ HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
      };
    }

    // TNZ returns a JSON body containing a MessageID for delivery tracking.
    // Parse defensively — a 2xx without a parseable body is still a success.
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(bodyText) as {
        MessageID?: string;
        messageID?: string;
        Result?: string;
      };
      messageId = parsed.MessageID ?? parsed.messageID;
    } catch {
      // Non-JSON 2xx — leave messageId undefined.
    }

    return { success: true, messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `TNZ network error: ${errorMessage}` };
  }
}

// ─── [[GTC-290]] — the status poll's one door to TNZ ─────────────────────────────────────────

/** TNZ's GET status URL; the MessageID is appended, encoded. Documented in the REST API v2.04. */
const TNZ_STATUS_ENDPOINT = 'https://api.tnz.co.nz/api/v2.04/get/status/';

/** Both documented as `application/json; encoding='utf-8'` for the GET status call. */
const TNZ_STATUS_JSON = "application/json; encoding='utf-8'";

/** How long one status call may take before it counts as not reached. */
export const TNZ_STATUS_TIMEOUT_MS = 5_000;

export type TnzStatusFetch =
  | { reached: true; httpStatus: number; bodyText: string }
  | { reached: false; error: string };

/**
 * Ask TNZ what happened to one message. [[GTC-290]].
 *
 * It sends nothing, but it is a call to the production account, so it sits behind the same live
 * switch as `sendViaTnz`, in the same order: the token, then the switch, then the network. On a
 * machine that is not live it returns `reached: false` with the switch's words and makes no request.
 * It authenticates with the existing `TNZ_AUTH_TOKEN` — no new credential.
 *
 * It never throws, and it does not read the answer: that is `parseTnzStatusResponse` in
 * `./tnz-status-contract.ts`, the second wire shape's own boundary.
 */
export async function getTnzMessageStatus(
  messageId: string,
  options: { timeoutMs?: number } = {}
): Promise<TnzStatusFetch> {
  if (!authToken) {
    return { reached: false, error: 'TNZ_AUTH_TOKEN not configured' };
  }

  if (!isLiveSendingOn()) {
    return { reached: false, error: LIVE_SENDS_OFF };
  }

  try {
    const response = await fetch(`${TNZ_STATUS_ENDPOINT}${encodeURIComponent(messageId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': TNZ_STATUS_JSON,
        Accept: TNZ_STATUS_JSON,
        Authorization: `Basic ${authToken}`,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? TNZ_STATUS_TIMEOUT_MS),
    });
    return { reached: true, httpStatus: response.status, bodyText: await response.text() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { reached: false, error: `TNZ network error: ${errorMessage}` };
  }
}
