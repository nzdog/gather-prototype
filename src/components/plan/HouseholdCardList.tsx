'use client';

import { useEffect, useRef, useState } from 'react';
import { DRAFT_WORDS } from '@/lib/households/draft';
import { HOST_CARD, HostPill } from '@/components/shared/HostCard';

export interface SavedHousehold {
  id: string;
  primaryContact: { name: string; email?: string; phone?: string };
  partner?: { personEventId?: string; name: string; email?: string; phone?: string };
  helpers: Array<{
    personEventId?: string;
    name: string;
    email?: string;
    phone?: string;
    /** GTC-172 (C1): host roled this kid with a job as an adult (§10.6). */
    adultRoled?: boolean;
    /** [[GTC-449]]: the host chose "Decide later" for this kid; a saved card shows it as W8 (S2.6). */
    decideLater?: boolean;
  }>;
  littleCount: number;
  guests: Array<{ personEventId?: string; name: string; email?: string; phone?: string }>;
  /** GTC-172 (C1): the household contact picker (§10.7). null = default to primary. */
  contactPersonEventId?: string | null;
  /**
   * GTC-256 (phase 2): this is the HOST'S OWN household — it holds the `role: HOST`
   * membership row. Derived on read from the members, never stored on the household.
   * It is still editable (she may add a partner later, and the demotion guard protects
   * her while she does), but it is NOT removable: the DELETE route refuses it, because
   * taking the household would take her PersonEvent with it and undo the very thing
   * phase 2 exists to guarantee.
   */
  isHostHousehold?: boolean;
  /**
   * GTC-256 (Ruling 6): the stored switch. NULL = not chosen. Carried on the client only
   * so an edit can round-trip it; the MEANING of null is resolveHouseholdMuted's, never
   * this component's.
   */
  messagesMuted?: boolean | null;
  /**
   * [[GTC-449]] (S2.3, ruling 35): the names of kids whose email address the server kept when the
   * host settled them to "don't message", because there is a no-email note for them. Set by the
   * setup page after a save, only in the page's own list, never from the server; each name shows W9.
   * Gone when she next opens the household or leaves the page.
   */
  keptEmailNames?: string[];
}

/**
 * [[GTC-449]] (S2.3) — W9, the founder's words (ruling 35), exactly, with straight apostrophes
 * (ruling 103). Change them only by a ruling.
 */
export const KEPT_EMAIL_WORDS = {
  kept: (name: string) =>
    `We kept ${name}'s email address on file, because there is a no-email note for them.`,
} as const;

/**
 * [[GTC-449]] (S2.6, ruling 14) — W8, the founder's words, exactly: "Josh (decide later)", the kid's
 * name, one space, then these words. Change them only by a ruling.
 */
export const DECIDE_LATER_WORDS = {
  marker: '(decide later)',
} as const;

interface HouseholdCardListProps {
  households: SavedHousehold[];
  onEdit: (householdId: string) => void;
  onDelete?: (householdId: string) => Promise<void>;
  editingHouseholdId?: string | null;
  /**
   * [[GTC-365]] item 16 — what the form holds now, not saved yet (`householdDraft`). While a saved
   * household is being edited it shows in that household's own card (W3); otherwise as a card of
   * its own (W1). Nothing here is written anywhere.
   */
  draft?: SavedHousehold | null;
  /**
   * [[GTC-365]] Q2 — where a new household's card sits: at the end on a computer, where it lands
   * once saved; first on a phone, just under the Save buttons.
   */
  draftAt?: 'start' | 'end';
  /**
   * [[GTC-394]] tweak 4 — what sits at the very top of the list, directly under its heading: on a
   * sample copy, "Add a crowd" (founder ruling, 19 Oct 2026). Absent, the list is as it was.
   */
  top?: React.ReactNode;
}

/**
 * [[GTC-384]] (item 57, Q6) — the column's count: saved households only (what is typed and not saved
 * is not counted), and the people in them by the same sum as Moment 1's "N people added." (the setup
 * page's `totalPeopleCount`): each household 1 + partner + helpers + kids without jobs + guests.
 */
function countLine(households: SavedHousehold[]): string {
  const people = households.reduce(
    (sum, h) => sum + 1 + (h.partner ? 1 : 0) + h.helpers.length + h.littleCount + h.guests.length,
    0
  );
  const n = households.length;
  return `${people} ${people === 1 ? 'person' : 'people'} in ${n} ${n === 1 ? 'household' : 'households'}`;
}

export default function HouseholdCardList({
  households,
  onEdit,
  onDelete,
  editingHouseholdId,
  draft = null,
  draftAt = 'end',
  top,
}: HouseholdCardListProps) {
  if (households.length === 0 && !draft) return null;

  const editing = !!editingHouseholdId && households.some((h) => h.id === editingHouseholdId);
  const newCard =
    draft && !editing ? (
      <HouseholdCard
        key="draft"
        household={draft}
        onEdit={onEdit}
        isEditing={false}
        draftLabel={DRAFT_WORDS.NOT_SAVED_YET}
      />
    ) : null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-500 mb-3">
        Ducks in a row so far
        {households.length > 0 && ` — ${countLine(households)}`}
      </p>
      {top}
      {draftAt === 'start' && newCard}
      {households.map((household) =>
        draft && editingHouseholdId === household.id ? (
          <HouseholdCard
            key={household.id}
            household={{ ...draft, id: household.id, isHostHousehold: household.isHostHousehold }}
            onEdit={onEdit}
            isEditing
            draftLabel={DRAFT_WORDS.EDITING}
          />
        ) : (
          <HouseholdCard
            key={household.id}
            household={household}
            onEdit={onEdit}
            onDelete={onDelete}
            isEditing={editingHouseholdId === household.id}
          />
        )
      )}
      {draftAt === 'end' && newCard}
    </div>
  );
}

function HouseholdCard({
  household,
  onEdit,
  onDelete,
  isEditing,
  draftLabel,
}: {
  household: SavedHousehold;
  onEdit: (householdId: string) => void;
  onDelete?: (householdId: string) => Promise<void>;
  isEditing: boolean;
  /** [[GTC-365]] — set when the card shows what is typed, not what is saved: W1 or W3. */
  draftLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Trigger fade-in on mount
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      errorTimerRef.current = setTimeout(() => setError(null), 5000);
      return () => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }
  }, [error]);

  // Clear error on any card interaction
  const clearError = () => {
    if (error) {
      setError(null);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(household.id);
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
      setError("Couldn't remove — try again.");
    }
  };

  const additionalCount =
    (household.partner ? 1 : 0) +
    household.helpers.length +
    household.littleCount +
    household.guests.length;

  const hasMemberSummary =
    household.partner ||
    household.helpers.length > 0 ||
    household.littleCount > 0 ||
    household.guests.length > 0;

  // Confirmation state
  if (confirmingDelete) {
    return (
      <div
        ref={cardRef}
        className="border border-gray-200 rounded-lg px-4 py-3 bg-white transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-sm text-gray-900 mb-2">Remove {household.primaryContact.name}?</p>
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-600 font-medium hover:text-red-800 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className="text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Keep
          </button>
        </div>
      </div>
    );
  }

  // [[GTC-394]] tweak 1: the host's own saved card stands out (a card being typed keeps its dashes).
  const hostLook = household.isHostHousehold && !draftLabel;
  return (
    <div
      ref={cardRef}
      data-draft-card={draftLabel ? '' : undefined}
      className={`border rounded-lg px-4 py-3 ${hostLook ? HOST_CARD : 'bg-white'} transition-opacity duration-200 ${
        draftLabel ? 'border-dashed border-gray-400' : hostLook ? '' : 'border-gray-200'
      }`}
      style={{ opacity: visible ? 1 : 0 }}
      onClick={clearError}
    >
      {/* [[GTC-365]] — W1 or W3: what this card shows is not saved yet. */}
      {draftLabel && <p className="text-xs text-gray-500 mb-1">{draftLabel}</p>}

      {/* Error message */}
      {error && <p className="text-red-600 text-sm mb-1">{error}</p>}

      {/* Line 1: Name + badge */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{household.primaryContact.name}</span>
        <div className="flex items-center gap-2">
          {/* GTC-256 (Ruling 1): "the host is at her own party" — she reads as herself in
              her own guest list, rather than as one more name in it. */}
          {household.isHostHousehold && <HostPill />}
          {additionalCount > 0 && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
              +{additionalCount}
            </span>
          )}
        </div>
      </div>

      {/* Line 2: Member summary */}
      {hasMemberSummary && (
        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500">
          {household.partner && <span>👫 {household.partner.name}</span>}
          {household.helpers.map((helper, i) => (
            <span key={`helper-${i}`}>
              👦 {helper.name}
              {/* [[GTC-449]] (S2.6, ruling 14) — W8: a kid saved as Decide later says so. Display only,
                  and only on a saved card: a card that shows what is typed has none. */}
              {!draftLabel && helper.decideLater && (
                <>
                  {' '}
                  <span data-decide-later-note="">{DECIDE_LATER_WORDS.marker}</span>
                </>
              )}
            </span>
          ))}
          {household.littleCount > 0 && <span>🧒 {household.littleCount}</span>}
          {household.guests.map((guest, i) => (
            <span key={i}>👤 {guest.name}</span>
          ))}
        </div>
      )}

      {/* [[GTC-449]] (S2.3, ruling 35) — W9: a quiet line after a refused clear, one per kid whose
          email the server kept. No button, no link. A card that shows what is typed has none. */}
      {!draftLabel &&
        household.keptEmailNames?.map((name, i) => (
          <p key={`kept-${i}`} data-kept-email-note="" className="mt-1 text-xs text-gray-500">
            {KEPT_EMAIL_WORDS.kept(name)}
          </p>
        ))}

      {/* Action links — none on a card that shows what is typed: the form is where it changes. */}
      <div className={`flex justify-end gap-3 mt-1${draftLabel ? ' hidden' : ''}`}>
        <button
          type="button"
          onClick={() => {
            clearError();
            onEdit(household.id);
          }}
          className="text-sm text-accent hover:text-accent-dark transition-colors"
        >
          Edit
        </button>
        {onDelete && !isEditing && !household.isHostHousehold && (
          <button
            type="button"
            onClick={() => {
              clearError();
              setConfirmingDelete(true);
            }}
            className="text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            Del
          </button>
        )}
      </div>
    </div>
  );
}
