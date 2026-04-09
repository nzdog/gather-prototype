# GTC-081 Spike Findings

**Filed:** 2026-04-10
**Status:** Investigation complete — no code changes
**Scope reminder:** Google People API, Microsoft Graph, Apple iCloud (CardDAV), browser Contact Picker API. Facebook, LinkedIn, CRMs explicitly out of scope.

---

## Per-Provider Summary

| Provider | Auth mechanism | App verification required | Sensitive scopes | Data storage needed | NZ prevalence | Effort estimate |
|---|---|---|---|---|---|---|
| **Google Contacts (People API)** | OAuth 2.0 (Authorization Code + PKCE) | **Yes — sensitive-scope verification** for `contacts.readonly`. Weeks-long review; demo video, privacy policy URL, homepage URL, scope justification required. | `https://www.googleapis.com/auth/contacts.readonly` is classified **sensitive** (not "restricted" — restricted is Gmail/Drive content). | Must store refresh token per user if repeat imports needed. Contact data itself should NOT be stored beyond the single import operation; pull → present → user confirms → persist only the selected names/emails/phones. | **High (dominant)** — Gmail is the default webmail for most NZ consumers and all Android users. Plausible majority share of Gather's target hosts. | **4–6 dev-days** (OAuth setup via NextAuth Google provider, token storage, People API fetch + pagination, name/email/phone normalisation, People modal UI, error states). Add **1–6 weeks calendar time** for Google verification before production launch. |
| **Microsoft Outlook / M365 (Graph API)** | OAuth 2.0 via Microsoft identity platform (Entra ID) | **No formal review for consumer scopes.** Consumer MSA accounts grant `Contacts.Read` directly. Work/school accounts may require tenant-admin consent depending on the org's policy. Publisher verification is optional and recommended for the app's "unverified publisher" warning to disappear. | `Contacts.Read` is a **delegated** permission. Not treated as "sensitive" in Google's sense — there's no multi-week review queue. Admin consent may be required for work tenants. | Same pattern as Google: store refresh token if repeat imports needed; do not persist contact data beyond the import action. | **Low–moderate** — Outlook/M365 is common in NZ workplaces but less dominant for personal contacts. Most consumer hosts will not have their personal network in Outlook. | **3–5 dev-days** (NextAuth Azure AD provider is mature; Graph API `/me/contacts` endpoint is straightforward; same UI surface as Google once normalised). **No verification timeline blocker** for launch. |
| **Apple iCloud Contacts (CardDAV)** | **No OAuth.** CardDAV with HTTP Basic auth using an **app-specific password** the user manually generates at appleid.apple.com. 2FA is not supported on the DAV channel. | N/A — no app to verify because there is no Apple-owned OAuth layer. | N/A | Would require storing the app-specific password (or re-prompting every import). Storing a raw credential that unlocks the user's iCloud account is a **significant privacy/security liability**. | **High** — NZ has very high iPhone penetration; many consumer hosts keep their contacts in iCloud. Losing this segment hurts. | **Not recommended as a v1 integration.** Effort to build CardDAV sync itself is ~5–8 days, but the UX (user must generate an app-specific password, paste it into Gather) is poor and the credential-storage risk is material. The Contact Picker API (below) is a far better path for iPhone hosts who visit Gather from Safari. |
| **Browser Contact Picker API** | None — purely client-side, user-gesture-triggered via `navigator.contacts.select()` | None | None | None — contacts never leave the browser unless the user selects and Gather POSTs them. Huge privacy win. | See NZ prevalence rows above — this covers the Android Chrome segment natively and iOS Safari behind a flag. | **1–2 dev-days** for the happy path (feature-detect, call the picker, normalise the returned `ContactInfo[]`, feed into the existing People modal). |

### Detailed per-question notes

#### Google People API

1. **OAuth flow:** Standard OAuth 2.0 Authorization Code with PKCE. NextAuth's Google provider handles this off the shelf. Gather uses a magic-link session model (not NextAuth for primary auth), so this integration would be a **secondary OAuth flow for data access only** — it should not replace or interfere with the magic-link session. The contacts-import OAuth is a separate token, scoped only to `contacts.readonly`, not the session cookie.
2. **App verification:** Yes. `contacts.readonly` is sensitive → must complete Google's verification: OAuth consent screen configured, privacy policy URL, terms URL, authorized domains, app homepage, and a **YouTube demo video** showing how the app requests and uses the scope. Review is typically 1–6 weeks. Failing the review blocks production use; during verification, apps are capped at 100 users on the test allowlist.
3. **Scopes:** `https://www.googleapis.com/auth/contacts.readonly` is sensitive. `contacts.other.readonly` (for "Other contacts" = auto-saved correspondents) is also sensitive. Avoid `contacts` (read-write) unless writing back. **Do not touch** any Gmail or Drive scopes — those are *restricted* and trigger a far more expensive review including a third-party security assessment.
4. **Data storage:** Store the refresh token encrypted at rest, scoped to the user. Contact data itself should be transient — fetch, present, let the host select, persist only the selected `{name, email, phone}` into `Person`. Do not cache Google's contact list server-side. NZ Privacy Act 2020 considerations: contact import is a collection of third-party personal information (the contacts themselves are not Gather users), so the privacy policy must disclose this collection and its purpose.
5. **NZ prevalence:** No authoritative NZ-specific data surfaced, but global Gmail market share is ~30–35% of email clients and Gmail is the default on every Android device. Reasonable inference: Gmail is the most common contact source for NZ consumer hosts.
6. **Effort:** 4–6 dev-days for the code. Verification calendar time is the bigger cost — should be started early if this is on the critical path.
7. **Fallback:** If the user declines OAuth or the token is revoked, fall back to the existing CSV import path and/or Contact Picker API. No degradation of app function.
8. **Gotchas:** Refresh tokens are revoked after 6 months of inactivity, and users may revoke access from their Google account at any time without warning — UI must handle token-invalid gracefully. Users with Google Workspace accounts may find their admin has disabled third-party OAuth entirely.

#### Microsoft Graph (Outlook / M365)

1. **OAuth flow:** OAuth 2.0 Authorization Code via Microsoft identity platform. NextAuth's Azure AD provider supports both consumer MSA and work/school accounts via the `common` tenant endpoint. Same architectural note as Google: this is a secondary OAuth scoped only to `Contacts.Read`, not a session replacement.
2. **App verification:** No formal multi-week review for `Contacts.Read`. Publisher verification (MPN account + domain verification) is optional but removes the "unverified app" warning. For work/school tenants, admins may need to grant consent if their tenant policy requires it — this is out of Gather's control and should be documented.
3. **Scopes:** `Contacts.Read` (delegated). Optionally `User.Read` for basic profile / display name during the OAuth handshake. No sensitive-scope category exists at Microsoft — permission classification is delegated-vs-application and admin-consent-vs-user-consent.
4. **Data storage:** Same as Google — store refresh token encrypted, don't persist contact payloads. NZ Privacy Act applies equally.
5. **NZ prevalence:** Moderate. Outlook/M365 is the dominant **workplace** mail system in NZ (alongside Google Workspace), but for personal contacts most consumers don't live there. For hosts running work-related gatherings (offsites, team events) this is valuable; for family/social gatherings less so.
6. **Effort:** 3–5 dev-days. Slightly faster than Google because there's no verification queue blocking launch.
7. **Fallback:** Same as Google — CSV, Contact Picker, or manual entry.
8. **Gotchas:** `/me/contacts` only returns the user's personal contacts, not the global address list (GAL). Distinguishing personal contacts from GAL entries matters for work accounts. Pagination via `@odata.nextLink`. Work tenants may restrict third-party apps entirely.

#### Apple iCloud (CardDAV)

1. **OAuth flow:** None. Apple does not offer an OAuth-based API for iCloud Contacts to third-party web apps. The only available mechanism is **CardDAV over HTTPS with HTTP Basic auth**, using an **app-specific password** the user must manually generate at appleid.apple.com and paste into Gather. 2FA is not supported on the DAV endpoint.
2. **App verification:** N/A (no Apple-owned OAuth layer exists).
3. **Scopes:** N/A. CardDAV Basic auth grants access to the entire user's contact store and potentially other iCloud data depending on password scope.
4. **Data storage:** Would require storing the app-specific password encrypted. **This is a material risk** — if Gather's DB is ever compromised, attackers would hold long-lived credentials that unlock the user's iCloud contacts (and historically have been conflated with other iCloud services). Revocation requires the user to go back to appleid.apple.com. Recommend **not** storing; re-prompt every import, but that's a poor UX.
5. **NZ prevalence:** High. NZ has high iPhone penetration and many consumers keep their contacts exclusively in iCloud.
6. **Effort:** 5–8 dev-days for the CardDAV client itself (REPORT + addressbook-multiget queries, vCard parsing, namespace handling). UX work on top of that.
7. **Fallback:** The **browser Contact Picker API** is a far better path for iPhone hosts visiting Gather from Safari. It provides on-device access to the same contact store without a credential. Recommend pointing iPhone hosts at Contact Picker rather than CardDAV.
8. **Gotchas:** App-specific passwords expire when the user changes their Apple ID password; DAV endpoint hosts rotate periodically (user's principal URL must be discovered, not hardcoded); iCloud CardDAV is not officially documented for third-party use.

#### Browser Contact Picker API

See dedicated section below.

---

## Browser Contact Picker API

**API surface:**
```js
const contacts = await navigator.contacts.select(
  ['name', 'email', 'tel'],
  { multiple: true }
);
// returns: Array<{ name: string[], email: string[], tel: string[] }>
```

**Key properties:**
- **Purely client-side.** No backend OAuth. No tokens. No server-side dependency. The browser mediates a native picker; only the contacts the user explicitly selects are returned to JavaScript.
- **User-gesture required.** Must be called inside a click/tap handler.
- **HTTPS required.** Won't work on `http://` (localhost is fine for dev).
- **Feature-detectable** via `'contacts' in navigator && 'ContactsManager' in window`.
- **Fields available:** `name`, `email`, `tel`, `address`, `icon`. This maps cleanly to Gather's `{name, email, phone}` shape — trivial normalisation.
- **Privacy model is excellent:** contacts never touch Gather's server unless the host explicitly selects them and the page POSTs them. Nothing is cached; re-calling the picker re-prompts.

**Browser support matrix (as of 2026-04):**

| Platform | Support | Notes |
|---|---|---|
| **Chrome Android** | ✅ Default on (≥ v80) | Full support, stable, used in production by many apps. The main happy path. |
| **Samsung Internet (Android)** | ✅ Default on | Inherits from Chromium. |
| **Edge Android** | ✅ Default on | Inherits from Chromium. |
| **iOS Safari** | ⚠️ Behind experimental flag | Present in iOS 15.1+ but hidden behind *Settings → Safari → Advanced → Feature Flags → Contact Picker API* (location varies by iOS version). **Not enabled for typical users.** As of 2026-04 the flag has still not been promoted to default. Effectively: **does not work for most iPhone users in the wild**. |
| **iOS Chrome / iOS Firefox** | ❌ | All iOS browsers use WebKit, same limitation as Safari. |
| **Desktop Chrome/Edge** | ❌ | API intentionally not exposed on desktop — Chromium treats it as mobile-only because there's no desktop-native contact store to mediate. |
| **Desktop Safari** | ❌ | Not implemented. |
| **Desktop Firefox** | ❌ | Not implemented. Firefox has not shipped it on any platform. |
| **Firefox Android** | ❌ | Not implemented. |

**Practical implication for Gather:**
- Android users on Chrome/Samsung Internet/Edge get a frictionless native contact picker.
- iPhone users **do not** get it unless they've manually flipped an experimental flag — assume zero coverage for iOS hosts.
- Desktop users never get it — they must use CSV or OAuth (Google/Outlook).
- This is not a standalone solution; it's an additive enhancement for Android hosts.

---

## Recommended Build Order

1. **Browser Contact Picker API (v1, ~1–2 days).** Lowest risk, lowest effort, best privacy story, no server state, no app verification, no tokens. Ships value immediately to Android hosts and is pure progressive enhancement. Feature-detect and show the button only when supported.

2. **Google People API OAuth integration (v2, ~4–6 dev-days + 1–6 weeks verification calendar time).** Highest NZ coverage because Gmail dominates consumer webmail and every Android device. **Start the Google verification process the same week the integration ticket is written** so the review clock runs in parallel with the build. This is the biggest leverage integration.

3. **Microsoft Graph integration (v3, ~3–5 days, no verification blocker).** Valuable for work-event hosts. Lower priority than Google because NZ consumer coverage is smaller, but code is faster to ship and there's no verification queue, so it can slot in opportunistically. Could be justified as a v2 sibling to Google if the Azure AD setup is cheap.

4. **Apple iCloud CardDAV integration (v4 — only if iPhone coverage is still a gap after v1+v2 ship, and probably not at all).** The credential-storage risk and UX friction make this a hard sell. The better answer for most iPhone hosts is "visit gather.nz in Safari, use Contact Picker when it ships to stable, or fall back to CSV." If this ticket ever gets written, scope it as a spike first to validate whether Apple has changed their stance — historically they have not.

---

## Blockers / Flags

- **Google OAuth verification is a calendar-time blocker, not a dev-time blocker.** If Google Contacts is on the critical path for a launch date, the verification process must start weeks in advance. Nothing in the build phase is hard; the review queue is the bottleneck. Flagging now because the build ticket would otherwise look like a 1-week ticket and miss the real timeline.

- **iOS Contact Picker is functionally unavailable for typical users** as of 2026-04. The experimental flag has not moved in years. Any plan that assumes "Contact Picker covers mobile" is wrong for iPhone — it only covers Android. This materially changes the coverage calculus.

- **Apple iCloud has no legitimate OAuth path.** CardDAV with app-specific passwords is the only mechanism and is not production-grade for a web app. Storing any form of user-provided credential that also unlocks iCloud is a privacy and security liability under the NZ Privacy Act 2020 (principles 5 and 11) and should not be undertaken without legal review.

- **Secondary-OAuth architectural constraint:** Gather uses a magic-link session model (see Do-Not-Touch Zone 2 in GATHER-BUILD-CONSTANTS.md). Any OAuth integration for contact import must be a **data-scoped secondary flow** with its own token storage (e.g. a new `OAuthConnection` table), and must **not** touch the magic-link auth, session cookies, or `AccessToken.scope` system. This is a hard architectural line. NextAuth cannot be dropped in as a full replacement; it would have to be used in a limited "connect an external account" mode.

- **Token storage adds a new secrets-handling surface.** Refresh tokens for Google/Microsoft are long-lived credentials. They must be encrypted at rest with a KMS or an env-backed AES key. A new encryption key becomes an operational secret that needs rotation and Railway env-var management. This is a small but real infra commitment that should be called out in the build ticket.

- **NZ Privacy Act 2020:** Importing third-party contacts means Gather is collecting personal information about people who are not Gather users (the contact owner's friends). The privacy policy must disclose this collection, its purpose, and retention. Retention should be **zero beyond the explicit import action** — only persist names/emails/phones the host has explicitly added to an event. Do not maintain a shadow copy of the imported contact list.

---

## Open Questions for Nigel

1. **Launch timing:** Is there a hard date by which contact-source integration must ship? If yes, the Google verification calendar time may force the order: start verification paperwork now, ship Contact Picker + Microsoft Graph as interim value, fold in Google when the review clears.

2. **Host segments:** Which host segment is the priority — consumer (family/social events) or professional (offsites/team events)? This changes whether Google (consumer) or Microsoft (professional) is the bigger v2 win.

3. **iPhone coverage strategy:** Given iOS Safari Contact Picker is effectively unavailable and iCloud CardDAV is not recommended, iPhone hosts will be served by either (a) Google OAuth if they use Gmail, or (b) the existing CSV import. Is that acceptable, or is iPhone-first coverage a hard requirement (which would force the CardDAV conversation)?

4. **Token storage appetite:** Is Gather willing to take on long-lived encrypted-at-rest OAuth refresh token storage for Google/Microsoft? If the preference is "import once, no persisted tokens," the UX is worse (re-auth every import) but the ops burden and breach surface are smaller. This is a product call, not a technical one.

5. **Who owns the Google/Microsoft developer accounts?** The app verification process requires a Google Cloud project owned by a verified domain (gather.nz ideally). Needs to exist before the verification clock starts. Same for a Microsoft Entra app registration. Is there an existing developer account, or does one need to be provisioned?

6. **Privacy-policy update:** Contact import requires a privacy policy update disclosing third-party contact collection. Is there someone to draft and publish this (legal review or DIY), and on what timeline?

---

*End of findings — no code changed, no commits made, no files touched outside `docs/tickets/`.*
