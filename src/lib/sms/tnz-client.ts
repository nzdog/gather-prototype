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
 */
export async function sendViaTnz(params: { to: string; message: string }): Promise<TnzSendResult> {
  const { to, message } = params;

  if (!authToken) {
    return { success: false, error: 'TNZ_AUTH_TOKEN not configured' };
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
