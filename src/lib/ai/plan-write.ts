import { Prisma } from '@prisma/client';
import { CATEGORY_EMOJIS, CATEGORY_LABELS, FOOD_CATEGORY_ORDER } from '@/lib/ai/plan-categories';
import type { SectionResponse } from '@/lib/ai/plan-input';
import { itemNameForStorage } from '@/lib/items/name';

type Tx = Prisma.TransactionClient;

/**
 * GTC-237 — the write phase, shared by `finalize-plan` and `regenerate-plan`. `plan-input.ts` is the input half of the same
 * seam: GTC-236 pulled the prompt assembly out so `finalize-plan` and
 * `regenerate-plan` build through one code path. This is the output half,
 * pulled out for the same reason and one more.
 *
 * THE ONE MORE IS TESTABILITY, and it is the stronger argument. Before this
 * module the only way to exercise what a regeneration does to the database
 * was to run a route that spends one of an event's ten Claude calls. A
 * High-severity data-loss path that costs money to assert does not get
 * asserted. `applyPlanSections` takes a sections array, so a test hands it a
 * fabricated payload and reads rows back.
 */

/**
 * The category label, CANONICAL FIRST.
 *
 * The two routes disagreed before this module existed: `finalize-plan`
 * preferred the model's `category` string and fell back to the canonical map,
 * `regenerate-plan` preferred the canonical map. Canonical wins, because
 * find-or-create keys on this string — model-first is exactly what produces a
 * second team of nearly the same name on a rerun, and a naming rule that
 * depends on an AI returning the same string twice is not a rule.
 */
export function planCategoryLabel(section: SectionResponse): string {
  const key = section.key ?? '';
  return CATEGORY_LABELS[key] ?? section.category ?? key ?? 'Items';
}

/**
 * The emoji, model first — the opposite precedence to the label above, on
 * purpose. Nothing keys on the emoji, so a model-supplied one that is nicer
 * than the canonical one costs nothing, and a typo'd one falls back.
 */
export function planCategoryEmoji(section: SectionResponse): string {
  const key = section.key ?? '';
  return section.emoji || CATEGORY_EMOJIS[key] || '📋';
}

/**
 * What a regeneration is allowed to throw away: the model's own untouched draft, and
 * nothing else. Everything absent from this predicate is preserved.
 *
 * TWO TESTS, NOT ONE. Provenance is the first — `source` and `isProtected`, the fields
 * V1's `clearPlanForRegeneration` already reads and the item PATCH already maintains by
 * flipping GENERATED → HOST_EDITED in place.
 *
 * A REPLY IS THE SECOND, and it is the one nothing read before GTC-237. An item a guest
 * has answered is a promise between two people; provenance records who drafted the row,
 * and a reply outranks a draft. So a GENERATED row nobody has touched is disposable only
 * while its assignment is absent or still PENDING.
 *
 * ⚠ "NOT PENDING" IS DELIBERATE AND WIDER THAN "SAID YES" (founder ruling, 2026-09-12).
 * DECLINED and MAYBE preserve the row too. Do not narrow this to ACCEPTED thinking you
 * are tightening a loose rule: replacing a declined item deletes the evidence that
 * someone said no, and the host needs to see that and re-home the item. The screen
 * exists to show her where the plan stands, not to tidy away the parts that went badly.
 */
export function disposableItemWhere(args: {
  eventId?: string;
  teamId?: string | null;
  kind: 'ITEM' | 'TASK';
}): Prisma.ItemWhereInput {
  const scope: Prisma.ItemWhereInput = args.teamId
    ? { teamId: args.teamId }
    : { team: { eventId: args.eventId } };
  return {
    ...scope,
    kind: args.kind,
    source: 'GENERATED',
    isProtected: false,
    OR: [{ assignment: { is: null } }, { assignment: { response: 'PENDING' } }],
  };
}

/**
 * GTC-379 (item 42, Q4) — the AI's sections in the questions' order (`FOOD_CATEGORY_ORDER`), so a
 * new plan reads Entrée & Starters before Mains however the AI ordered them. A key the order does
 * not know, or none, goes last, in the AI's order. A new array: the input is left as it was.
 */
export function sectionsInPlanOrder<S extends { key?: string }>(sections: S[]): S[] {
  const order: readonly string[] = FOOD_CATEGORY_ORDER;
  const rank = (s: S) => {
    const i = order.indexOf(s.key ?? '');
    return i === -1 ? order.length : i;
  };
  return sections
    .map((section, i) => ({ section, i }))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.i - b.i)
    .map(({ section }) => section);
}

/**
 * [[GTC-482]] — A DRAFTED DISH'S SESSION, READ BACK (the founder's brief, 26 Nov 2026: "A dish whose
 * label matches nothing is kept on 'whole event' and counted ... Never dropped, never guessed").
 * The label is compared after trimming and in capitals ("s2 " is S2); "whole" is the whole event;
 * anything else, or nothing, is the whole event and counted. The id comes only from `dayIds`, the
 * map built from this event's own sessions, so a reply can never name another event's session.
 */
export type UnplacedReason = 'missing' | 'unknown' | 'gone';
export type UnplacedCount = Record<UnplacedReason, number>;

export function sessionOfLabel(
  label: unknown,
  dayIds: Record<string, string>
): { dayId: string | null; unplaced: UnplacedReason | null } {
  if (typeof label !== 'string' || label.trim() === '') return { dayId: null, unplaced: 'missing' };
  const key = label.trim().toUpperCase();
  if (key === 'WHOLE') return { dayId: null, unplaced: null };
  const dayId = Object.prototype.hasOwnProperty.call(dayIds, key) ? dayIds[key] : undefined;
  return dayId ? { dayId, unplaced: null } : { dayId: null, unplaced: 'unknown' };
}

/** [[GTC-482]]: the label a kept row is described by: its session's ("S2"), or "whole". */
export function labelOfSession(dayId: string | null, dayIds: Record<string, string>): string {
  if (!dayId) return 'whole';
  const hit = Object.entries(dayIds).find(([, id]) => id === dayId);
  return hit ? hit[0] : 'whole';
}

/** [[GTC-482]]: the dishes that matched no session, all reasons together. */
export function unplacedTotal(c: UnplacedCount): number {
  return c.missing + c.unknown + c.gone;
}

/**
 * [[GTC-482]] NET 1 — LABELS NEVER REACH A ROW (the founder's ruling at the decision gate, 27 Nov
 * 2026). The labels are the prompt's shorthand; a host or a guest knows a session by its name. In
 * a drafted text, each of this event's labels (S1 to Sn, as a whole word, in any case) is replaced
 * by its session's name, and a label written beside its own session's name ("Christmas lunch S2",
 * "S2 (Christmas lunch)") simply goes, so the name is not said twice. A label this event does not
 * have ("S9" of five) is left as written. Used only when the sessions block was in the prompt.
 */
export function sessionNamesOf(
  sessions: readonly { label: string; name: string }[]
): Record<string, string> {
  return Object.fromEntries(sessions.map((s) => [s.label, s.name]));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A session's name and its first or last words ("Christmas evening", "evening", "Christmas"). */
function nameParts(name: string): string[] {
  const words = name.trim().split(/\s+/);
  const parts = new Set<string>();
  for (let i = 0; i < words.length; i++) parts.add(words.slice(i).join(' '));
  for (let j = words.length - 1; j > 0; j--) parts.add(words.slice(0, j).join(' '));
  return [...parts].sort((a, b) => b.length - a.length);
}

export function relabelText(text: string, names: Record<string, string>): string {
  let out = text;
  // The longest label first, so "S12" is never read as "S1".
  for (const label of Object.keys(names).sort((a, b) => b.length - a.length)) {
    const name = names[label];
    if (!name) continue;
    const l = escapeRegExp(label);
    // The label beside its own session's name, or part of it ("S3 evening", "lunch S2",
    // "Christmas lunch (S2)"), becomes the name once; a label alone becomes the name.
    const alt = nameParts(name)
      .map((p) => p.split(/\s+/).map(escapeRegExp).join('\\s+'))
      .join('|');
    const to = () => name;
    out = out
      .replace(new RegExp(`\\b(?:${alt})\\s*[(\\[]\\s*${l}\\s*[)\\]]`, 'gi'), to)
      .replace(new RegExp(`\\b${l}\\b\\s*[(\\[]\\s*(?:${alt})\\s*[)\\]]`, 'gi'), to)
      .replace(new RegExp(`\\b(?:${alt})[\\s,:–—-]*\\b${l}\\b`, 'gi'), to)
      .replace(new RegExp(`\\b${l}\\b[\\s,:–—-]*(?:${alt})\\b`, 'gi'), to)
      .replace(new RegExp(`\\b${l}\\b`, 'gi'), to);
  }
  return out;
}

function relabelValue(value: unknown, names: Record<string, string>): unknown {
  if (typeof value === 'string') return relabelText(value, names);
  if (Array.isArray(value)) return value.map((v) => relabelValue(v, names));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'session' ? v : relabelValue(v, names)])
    );
  }
  return value;
}

/**
 * NET 1 over a whole reply, in place, before anything reads it: every text of each drafted dish
 * but its "session", each job, and the coverage and reminders the screen shows next. Returns how
 * many dishes and jobs it changed.
 */
export function relabelDraft(
  reply: {
    sections?: unknown;
    tasks?: unknown;
    dietaryCoverage?: unknown;
    thingsToConsider?: unknown;
  },
  names: Record<string, string>
): { dishes: number; jobs: number } {
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  let dishes = 0;
  let jobs = 0;
  if (Array.isArray(reply.sections)) {
    for (const section of reply.sections) {
      if (!section || !Array.isArray(section.items)) continue;
      section.items = section.items.map((item: unknown) => {
        const next = relabelValue(item, names);
        if (changed(item, next)) dishes++;
        return next;
      });
    }
  }
  if (Array.isArray(reply.tasks)) {
    reply.tasks = reply.tasks.map((task: unknown) => {
      const next = relabelValue(task, names);
      if (changed(task, next)) jobs++;
      return next;
    });
  }
  if (Array.isArray(reply.dietaryCoverage)) {
    reply.dietaryCoverage = relabelValue(reply.dietaryCoverage, names);
  }
  if (Array.isArray(reply.thingsToConsider)) {
    reply.thingsToConsider = relabelValue(reply.thingsToConsider, names);
  }
  return { dishes, jobs };
}

/**
 * [[GTC-482]] NET 2 — NO TWIN OF A KEPT DISH (the founder's ruling at the decision gate, 27 Nov
 * 2026). In a regenerate, a drafted dish with the same name (case and spaces aside), category and
 * session as a row being kept is not written, and is counted. Used only when the sessions block was
 * in the prompt; without it every drafted dish is written, as before.
 */
export function twinKey(name: string, teamName: string, dayId: string | null): string {
  return `${name.toLowerCase().replace(/\s+/g, '')}|${teamName}|${dayId ?? ''}`;
}

export async function applyPlanSections(
  tx: Tx,
  args: {
    eventId: string;
    sections: SectionResponse[];
    batchId: string;
    scopeTeamId?: string | null;
    /** [[GTC-482]]: each session's label to its id, when sessions were in the prompt. */
    sessionDayIds?: Record<string, string>;
    /** [[GTC-482]] net 2: the rows a regenerate keeps, when sessions were in the prompt. */
    keptRows?: readonly { name: string; teamName: string; dayId: string | null }[];
  }
): Promise<{ replaced: number; created: number; unplaced?: UnplacedCount; twins?: number }> {
  const { eventId, sections, batchId, scopeTeamId, sessionDayIds, keptRows } = args;

  // ITEM LEVEL, NEVER TEAM LEVEL. The statement this replaces was
  // `team.deleteMany({ eventId, source: 'GENERATED' })`, which reasoned about
  // provenance one level too high: `Item.team` is onDelete: Cascade, so the rows the
  // predicate above exists to spare died with the team anyway. Deleting a team can
  // never be the way a regeneration clears items.
  const del = await tx.item.deleteMany({
    where: disposableItemWhere({ eventId, teamId: scopeTeamId, kind: 'ITEM' }),
  });
  const replaced = del.count;

  // [[GTC-482]]: the belongs-to-this-event check, here inside the write: only this event's
  // sessions that still exist. A session removed while the AI was answering puts its dishes on
  // the whole event, counted.
  const liveSessions = sessionDayIds
    ? new Set(
        (
          await tx.day.findMany({
            where: { eventId, id: { in: Object.values(sessionDayIds) } },
            select: { id: true },
          })
        ).map((d) => d.id)
      )
    : null;
  const unplaced: UnplacedCount = { missing: 0, unknown: 0, gone: 0 };
  const kept = keptRows ? new Set(keptRows.map((k) => twinKey(k.name, k.teamName, k.dayId))) : null;
  let twins = 0;

  let created = 0;
  // GTC-379: a new team is created in the questions' order. A team found by name keeps its place,
  // so a plan already drafted keeps its order, even on a full redraft (ruling 2).
  for (const section of sectionsInPlanOrder(sections)) {
    const label = planCategoryLabel(section);

    // Find OR create. The team usually still stands, because the delete above took its
    // disposable rows and not the team itself.
    let team = await tx.team.findFirst({ where: { eventId, name: label } });
    if (!team) {
      const maxOrder = await tx.team.aggregate({
        where: { eventId },
        _max: { displayOrder: true },
      });
      team = await tx.team.create({
        data: {
          name: label,
          eventId,
          source: 'GENERATED',
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });
    }

    // Append after whatever survived rather than restarting at 1, or the new rows
    // interleave with hers and the plan reads as though it were shuffled.
    const maxDisp = await tx.item.aggregate({
      where: { teamId: team.id },
      _max: { displayOrder: true },
    });
    let nextDisplayOrder = (maxDisp._max.displayOrder ?? 0) + 1;
    for (const item of section.items) {
      const placed = sessionDayIds ? sessionOfLabel(item.session, sessionDayIds) : null;
      let dayId = placed?.dayId ?? null;
      let reason = placed?.unplaced ?? null;
      if (!reason && dayId && liveSessions && !liveSessions.has(dayId)) {
        reason = 'gone';
        dayId = null;
      }
      const storedName = itemNameForStorage(item.name) ?? item.name;
      if (kept && kept.has(twinKey(storedName, label, dayId))) {
        twins++;
        continue;
      }
      if (reason) unplaced[reason]++;
      await tx.item.create({
        data: {
          // GTC-302: the name as stored — one leading article stripped, case untouched.
          name: storedName,
          teamId: team.id,
          quantityAmount: item.quantity,
          quantityUnit: 'CUSTOM',
          quantityUnitCustom: item.unit,
          quantityText: item.servingSize,
          notes: item.notes ?? null,
          critical: item.critical ?? false,
          criticalReason: item.critical
            ? (item.criticalReason ?? 'Important item for the event')
            : null,
          source: 'GENERATED',
          aiGenerated: true,
          userConfirmed: false,
          generatedBatchId: batchId,
          displayOrder: nextDisplayOrder,
          dietaryTags:
            item.dietaryTags && item.dietaryTags.length > 0 ? item.dietaryTags : undefined,
          ...(dayId ? { dayId } : {}),
        },
      });
      nextDisplayOrder++;
      created++;
    }
  }

  return {
    replaced,
    created,
    ...(sessionDayIds ? { unplaced } : {}),
    ...(kept ? { twins } : {}),
  };
}

export async function sweepEmptyGeneratedTeams(
  tx: Tx,
  args: { eventId: string; scopeTeamId?: string | null }
): Promise<number> {
  const candidates = await tx.team.findMany({
    where: {
      eventId: args.eventId,
      source: 'GENERATED',
      isProtected: false,
      ...(args.scopeTeamId ? { id: args.scopeTeamId } : {}),
    },
    include: { _count: { select: { items: true } } },
  });
  let swept = 0;
  for (const t of candidates) {
    if (t._count.items === 0) {
      await tx.team.delete({ where: { id: t.id } });
      swept++;
    }
  }
  return swept;
}
