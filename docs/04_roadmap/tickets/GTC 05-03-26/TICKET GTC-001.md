TICKET GTC-001
Participant cookie overwrites host session
Context
Opening a participant link (/p/{token}) in the same browser as an authenticated host session sets an HTTP-only cookie that overrides all subsequent navigation — routing every click to the participant view. Discovered during Agent C's lifecycle walkthrough when opening Aroha Tane's participant link mid-session.
Task
Fix session isolation so that participant, coordinator, and host sessions can coexist in the same browser without overwriting each other.
To investigate
Start by reading the auth and session middleware. Likely locations:

src/middleware.ts or middleware.ts at root
src/lib/auth/ or src/lib/session/
The route handlers for /p/[token], /h/[token], /c/[token]

Look for where the HTTP-only cookie is being set on participant link resolution and whether it shares a cookie name/scope with the host session cookie.
Expected behaviour
Opening a participant link should create a scoped participant session that does not affect the authenticated host session. Navigating to /plan/events after viewing a participant link should still show the host dashboard.
Acceptance criteria

Host can open a participant link in the same browser and return to their dashboard without being rerouted
Participant session does not overwrite or shadow the host auth cookie