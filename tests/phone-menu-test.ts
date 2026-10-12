/**
 * GTC-358 — on a phone, the menu bar. The founder's rulings R1 and R2 and the PLAN RULINGS of
 * 2026-10-03 are verbatim in `docs/tickets/GTC-358.md`. What this suite holds, in headless Chrome
 * against the dev server:
 *
 *   W  R2: at 390px, every page a host uses is exactly the screen's width — Moments 1 to 3, the
 *      pre-flight, the board, "Who I chase", Your Events, and the old dashboard, home, Past Events
 *      and Billing besides — with long names, so the fixture is not kinder than a real event
 *   M  R1: on a phone the bar is the logo and a three-line menu button, its label "Open menu" /
 *      "Close menu"; the panel holds the links, the email and Sign Out (Sign In when signed
 *      out); it closes on Escape (focus back on the button), on a link, and on a tap outside.
 *      [[GTC-381]] ruling 2: the links are Your Events and New Event, then the email, Billing and
 *      Sign Out; Home and Past Events have gone
 *   K  the width it changes at (Q9): the menu below 1280px; from 1280px the bar, pinned to geometry
 *      measured before any change, as GTC-381 trims it (two links; the email opens the rest)
 *   Z  every fixture removed by id; the OutboundMessage and InviteEvent totals as found
 *
 * NOTHING SENDS: nothing is pressed or drained; `installProviderTrap` walls this process and the
 * browser resolves nothing but localhost (`tests/helpers/headless.ts`). Needs the dev server on :3000
 * with the provider keys blanked. Fixtures: example.com addresses, no phone numbers, a session row.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const TAG = 'GTC358';
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  — ${detail}` : ''}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}

/**
 * The bar at 1280px on /plan/events: [left, top, width, height]. Measured 2026-10-03 at `c6e7b3a`,
 * before any GTC-358 change, as Home [240, 14, 95, 36], Your Events [339, 14, 134, 36], Past Events
 * [477, 14, 133, 36], New Event [614, 14, 126, 36], Billing [744, 14, 96, 36], and Sign Out's right
 * edge at 1264. [[GTC-381]] (ruling 2, item 36: "Your Events and New Event stay. Home goes …
 * Billing and Sign Out move under your email. Past Events" is hidden) trims the list to two, with
 * each link's size unchanged: Your Events moves to where Home started (240) and New Event follows it
 * after the same 4px gap (240 + 134 + 4 = 378); the email, now the button that opens Billing and Sign
 * Out (Q6), ends where Sign Out ended (1264).
 */
const BAR_1280 = {
  nav: [0, 0, 1280, 65],
  links: {
    'Your Events': [240, 14, 134, 36],
    'New Event': [378, 14, 126, 36],
  } as Record<string, number[]>,
  accountRight: 1264,
};
/** [[GTC-381]] ruling 2: the bar's two links; these four leave the bar (Billing, Sign Out: under the email). */
const LINKS = ['Your Events', 'New Event'];
const GONE = ['Home', 'Past Events', 'Billing', 'Sign Out'];

const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

async function fixture() {
  const stamp = String(Date.now()).slice(-6);
  const mail = (l: string) => `${TAG.toLowerCase()}-${l}-${stamp}@example.test`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Henderson-Fitzgerald', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 40 * 864e5);
  const person = async (name: string) => {
    const p = await prisma.person.create({
      data: { name, email: mail(`${name.split(' ')[0].toLowerCase()}${created.people.length}`) },
    });
    created.people.push(p.id);
    return p;
  };
  /** One event per stage, so every page is read in the state that opens it. */
  const mk = async (
    label: string,
    stage: 'opening' | 'moment1' | 'moment2' | 'plan' | 'moment3' | 'sent'
  ) => {
    const ev = await prisma.event.create({
      data: {
        name: `Christmas at the Henderson-Fitzgeralds' place — ${label}`,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: stage === 'moment3' || stage === 'sent' ? 'CONFIRMING' : 'DRAFT',
        sentAt: stage === 'sent' ? new Date() : null,
        venueName: 'The old woolshed at the end of Taumata Road',
        guestCount: 8,
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    if (stage === 'opening') return ev;
    const hhK = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        role: 'HOST',
        householdId: hhK.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const guests = [];
    for (const n of [
      'Josephine Walker-Montgomery',
      'Rossiter Walker-Montgomery',
      'Augustus Tane',
    ]) {
      const p = await person(n);
      guests.push(p);
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: ev.id,
          role: 'PARTICIPANT',
          householdId: hh.id,
          householdRole: 'PRIMARY_CONTACT',
        },
      });
    }
    if (stage === 'moment1') return ev;
    await prisma.eventSetup.create({
      data: {
        eventId: ev.id,
        eventType: 'christmas',
        planApprovedAt: stage === 'moment3' || stage === 'sent' ? new Date() : null,
      },
    });
    if (stage === 'moment2') return ev;
    const team = await prisma.team.create({
      data: { name: 'Mains and the things that go with them', eventId: ev.id },
    });
    const names = [
      'Glazed ham with a pineapple, mustard and brown sugar crust',
      'Roast potatoes with rosemary and sea salt',
      'Pavlova with passionfruit, kiwifruit and whipped cream',
    ];
    for (const [i, n] of names.entries()) {
      const it = await prisma.item.create({
        data: {
          name: n,
          teamId: team.id,
          source: 'GENERATED',
          status: i < 2 ? 'ASSIGNED' : 'UNASSIGNED',
        } as any,
      });
      if (stage !== 'plan' && i < 2) {
        await prisma.assignment.create({ data: { itemId: it.id, personId: guests[i].id } });
      }
    }
    return ev;
  };
  const ev = {
    opening: await mk('opening', 'opening'),
    moment1: await mk('Moment 1', 'moment1'),
    moment2: await mk('Moment 2', 'moment2'),
    plan: await mk('the plan', 'plan'),
    moment3: await mk('Moment 3', 'moment3'),
    sent: await mk('sent', 'sent'),
  };
  return { token, email: user.email, ev };
}

async function run(
  chrome: Headless,
  token: string,
  email: string,
  ev: Record<string, { id: string }>
) {
  await chrome.setSessionCookie(token);

  // ── W — every host page, at 390px.
  const pages: [string, string][] = [
    ['W1 the opening screen', `/plan/${ev.opening.id}/setup`],
    ['W2 Moment 1', `/plan/${ev.moment1.id}/setup`],
    ['W3 Moment 2, step 1', `/plan/${ev.moment2.id}/setup`],
    ['W4 the plan view', `/plan/${ev.plan.id}/setup`],
    ['W5 Moment 3', `/plan/${ev.moment3.id}/setup`],
    ['W6 the pre-flight', `/plan/${ev.moment3.id}/pre-flight`],
    ['W7 the board', `/plan/${ev.sent.id}/glance`],
    ['W8 "Who I nudge"', `/plan/${ev.sent.id}/pre-flight`],
    ['W9 Your Events', '/plan/events'],
    ['W10 the old dashboard', `/plan/${ev.sent.id}`],
    ['W11 home', '/'],
    ['W12 Past Events', '/plan/templates'],
    ['W13 Billing', '/billing'],
  ];
  await chrome.setViewport(390, 844, true);
  for (const [label, path] of pages) {
    await chrome.navigate(path, 7000);
    const w = await chrome.evaluate<number>('document.documentElement.scrollWidth');
    assert('W', `${label} is exactly 390px wide at 390px (${w}px)`, w === 390);
  }

  // ── M — the menu, at 390px.
  await chrome.navigate('/plan/events', 6000);
  const state = () =>
    chrome.evaluate<{
      button: boolean;
      label: string | null;
      expanded: string | null;
      panel: boolean;
      panelText: string;
      barLinks: number;
      barTexts: string[];
      focused: boolean;
      path: string;
    }>(
      `(() => { const b = document.querySelector('nav button[aria-controls="site-menu"]');
        const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const panel = document.getElementById('site-menu');
        const barLinks = [...document.querySelectorAll('nav a')].filter((a) => !panel?.contains(a) && visible(a) && ${JSON.stringify(LINKS)}.includes(a.innerText.trim())).length;
        const account = document.getElementById('account-menu');
        const barTexts = [...document.querySelectorAll('nav a, nav button')].filter((e) => !panel?.contains(e) && !account?.contains(e) && visible(e)).map((e) => e.innerText.trim()).filter(Boolean);
        return { button: visible(b), label: b?.getAttribute('aria-label') ?? null, expanded: b?.getAttribute('aria-expanded') ?? null,
          panel: visible(panel), panelText: visible(panel) ? panel.innerText : '', barLinks, barTexts, focused: !!b && document.activeElement === b, path: location.pathname }; })()`
    );
  const closed = await state();
  assert(
    'M',
    'M1 R1: on a phone the bar shows a menu button, "Open menu", collapsed',
    closed.button && closed.label === 'Open menu' && closed.expanded === 'false',
    JSON.stringify(closed)
  );
  assert(
    'M',
    'M2 and none of the links shows in the bar until it is opened',
    closed.barLinks === 0 && !closed.panel,
    JSON.stringify(closed)
  );
  await chrome.click('nav button[aria-controls="site-menu"]');
  const open = await state();
  assert(
    'M',
    'M3 tapping it opens Your Events and New Event, then the email, Billing and Sign Out, and neither Home nor Past Events; the button reads "Close menu" (GTC-381 ruling 2, Q6)',
    open.panel &&
      open.expanded === 'true' &&
      open.label === 'Close menu' &&
      LINKS.every((l) => open.panelText.includes(l)) &&
      open.panelText.includes(email) &&
      open.panelText.includes('Billing') &&
      open.panelText.includes('Sign Out') &&
      open.panelText.indexOf('Billing') > open.panelText.indexOf(email) &&
      !/\bHome\b|Past Events/.test(open.panelText),
    JSON.stringify(open)
  );
  await chrome.pressKey('Escape');
  const escaped = await state();
  assert(
    'M',
    'M4 Escape closes it, and focus goes back to the button',
    !escaped.panel && escaped.expanded === 'false' && escaped.focused,
    JSON.stringify(escaped)
  );
  await chrome.click('nav button[aria-controls="site-menu"]');
  await chrome.evaluate(
    `document.elementFromPoint(195, 700)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`
  );
  await new Promise((r) => setTimeout(r, 400));
  const outside = await state();
  assert(
    'M',
    'M5 a tap outside the panel closes it',
    !outside.panel && outside.expanded === 'false',
    JSON.stringify(outside)
  );
  // [[GTC-381]] ruling 2: Past Events has left the menu, so the link tapped is Your Events, from
  // another page (Billing), as the panel's links are reached there.
  await chrome.navigate('/billing', 6000);
  await chrome.click('nav button[aria-controls="site-menu"]');
  await chrome.click('#site-menu a[href="/plan/events"]');
  await new Promise((r) => setTimeout(r, 5000));
  const went = await state();
  assert(
    'M',
    'M6 tapping a link in the panel goes there, and the panel is closed when it arrives',
    went.path === '/plan/events' && !went.panel,
    JSON.stringify(went)
  );
  await chrome.clearCookies();
  await chrome.navigate('/', 6000);
  await chrome.click('nav button[aria-controls="site-menu"]');
  const signedOut = await state();
  assert(
    'M',
    'M7 signed out, the menu offers Sign In',
    signedOut.panel && signedOut.panelText.includes('Sign In'),
    JSON.stringify(signedOut)
  );
  await chrome.setSessionCookie(token);

  // ── K — the width it changes at, and the computer's bar.
  await chrome.setViewport(1279, 900, false);
  await chrome.navigate('/plan/events', 6000);
  const at1279 = await state();
  assert(
    'K',
    'K1 Q9: at 1279px it is still the menu button',
    at1279.button && at1279.barLinks === 0,
    JSON.stringify(at1279)
  );
  await chrome.setViewport(1280, 900, false);
  await chrome.navigate('/plan/events', 6000);
  const at1280 = await state();
  assert(
    'K',
    'K2 from 1280px no menu button; the bar’s links are Your Events and New Event, and Home, Past Events, Billing and Sign Out are not in it (GTC-381 ruling 2)',
    !at1280.button && at1280.barLinks === 2 && !at1280.barTexts.some((t) => GONE.includes(t)),
    JSON.stringify(at1280)
  );
  const geo = await chrome.evaluate<{
    nav: number[];
    links: Record<string, number[]>;
    accountRight: number;
    signOut: boolean;
    width: number;
  }>(
    `(() => { const box = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      const nav = document.querySelector('nav'); const links = {};
      for (const a of nav.querySelectorAll('a')) { const t = a.innerText.trim(); if (${JSON.stringify(LINKS)}.includes(t) && a.getClientRects().length) links[t] = box(a); }
      const acc = nav.querySelector('button[aria-controls="account-menu"]');
      const so = [...nav.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Sign Out' && b.getClientRects().length);
      return { nav: box(nav), links, accountRight: acc && acc.getClientRects().length ? Math.round(acc.getBoundingClientRect().right) : -1, signOut: so, width: document.documentElement.scrollWidth }; })()`
  );
  assert(
    'K',
    "K3 the computer's bar: the bar as measured before GTC-358; Your Events and New Event each the size it was, starting where Home started; the email's button ending where Sign Out ended, and no Sign Out in the bar (GTC-381 ruling 2, Q6)",
    JSON.stringify(geo?.nav) === JSON.stringify(BAR_1280.nav) &&
      LINKS.every((l) => JSON.stringify(geo?.links?.[l]) === JSON.stringify(BAR_1280.links[l])) &&
      geo?.accountRight === BAR_1280.accountRight &&
      geo?.signOut === false,
    JSON.stringify(geo)
  );
  assert(
    'K',
    'K4 CONTROL: and the page is 1280px wide at 1280px',
    geo?.width === 1280,
    String(geo?.width)
  );
  assert(
    'K',
    'K5 CONTROL: the browser reached nothing but localhost',
    chrome.hostsRequested().every((h) => /^localhost(:\d+)?$/.test(h)),
    chrome.hostsRequested().join(', ')
  );
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const ev = { in: created.events };
  await del(() => prisma.session.deleteMany({ where: { userId: { in: created.users } } }));
  await del(() => prisma.outboundMessage.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.inviteEvent.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.event.deleteMany({ where: { id: ev } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  const totalsBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  let chrome: Headless | null = null;
  try {
    const { token, email, ev } = await fixture();
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9372 });
    await run(chrome, token, email, ev);
  } catch (e) {
    assert(
      'run',
      `the suite ran to completion (threw: ${(e as Error).message.split('\n')[0]})`,
      false
    );
  } finally {
    chrome?.close();
    await cleanup();
    const totalsAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.people } } })) +
      (await prisma.user.count({ where: { id: { in: created.users } } }));
    assert(
      'Z',
      `Z1 CONTROL: every fixture removed by id, and the totals as found (${totalsBefore} -> ${totalsAfter})`,
      left === 0 && JSON.stringify(totalsBefore) === JSON.stringify(totalsAfter)
    );
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (red.length > 0) console.log(`RED:\n${red.map((r) => `  ${r}`).join('\n')}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
