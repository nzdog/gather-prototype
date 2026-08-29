'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import MomentArc from './MomentArc';
import { normalizePhoneNumber, isInternationalNumber } from '@/lib/phone';
import { SavedHousehold } from './HouseholdCardList';

export interface Moment1PersonInput {
  primaryContact: {
    name: string;
    email?: string;
    phone?: string;
  };
  partner?: {
    personEventId?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  helpers?: Array<{
    personEventId?: string;
    name: string;
    email?: string;
    phone?: string;
    /**
     * GTC-172 (C1): the host's explicit decision that this kid with a job is old
     * enough to be messaged directly (Moment 4 §10.6). Stores an adult householdRole
     * instead of CHILD. Never inferred — the host ticks it, or it stays false.
     */
    adultRoled?: boolean;
  }>;
  littleCount?: number;
  guests?: Array<{
    personEventId?: string;
    name?: string;
    email?: string;
    phone?: string;
  }>;
  /** GTC-172 (C1): the household contact picker (§10.7). null = default to primary. */
  contactPersonEventId?: string | null;
  /**
   * GTC-256 (Ruling 6): sent ONLY when editing the host's own household, so an ordinary
   * household's PUT leaves the column alone (`undefined` = untouched). Ruling 6 gives the
   * switch to the host about HER household; phase 2 surfaces it nowhere else.
   */
  messagesMuted?: boolean | null;
}

/**
 * GTC-172 (C1): a person who may be a household's channel (§10.7). Gathered across the
 * WHOLE event, not per household — the picker is cross-household capable, because
 * "Grandma's channel may live in another household".
 */
export interface ChannelCandidateOption {
  personEventId: string;
  name: string;
  householdName: string;
  householdId: string;
}

/**
 * GTC-256 (phase 2): what Moment 1's FIRST screen sends — the host's own household.
 *
 * A different shape from Moment1PersonInput, and deliberately so. There is no
 * `primaryContact` here because the primary is not the client's to name: it is
 * `Event.hostId`'s existing Person (Ruling 10), and her email is read from that row
 * rather than sent (`Person.email` is @unique and is what joins her to her User).
 */
export interface HostHouseholdPayload {
  /** Ruling 2 — a household of one, NOT absent. She is still eating. */
  alone: boolean;
  name: string;
  phone?: string;
  partner?: Moment1PersonInput['partner'];
  helpers?: Moment1PersonInput['helpers'];
  littleCount?: number;
  guests?: Moment1PersonInput['guests'];
  /** Ruling 6 — whether her household's messages send. */
  messagesMuted: boolean;
}

interface Moment1InputFormProps {
  eventId: string;
  eventName: string;
  onComplete: () => void;
  onAddPerson: (person: Moment1PersonInput) => Promise<void>;
  editingHousehold?: SavedHousehold | null;
  onEditSave?: (householdId: string, person: Moment1PersonInput) => Promise<void>;
  onCancelEdit?: () => void;
  totalPeopleCount?: number;
  channelCandidates?: ChannelCandidateOption[];
  /**
   * GTC-256 (phase 2): renders this form as Moment 1's FIRST screen — the host's own
   * household (Ruling 1, read as a sequence: her row must exist before any other
   * household can be entered). Absent everywhere else, so every other use of this form
   * is byte-for-byte what it was.
   */
  hostMode?: { name: string; email: string | null; phone: string | null };
  onSaveHostHousehold?: (payload: HostHouseholdPayload) => Promise<void>;
}

interface GuestForm {
  id: string;
  /** Stable identity of an existing member's PersonEvent row (absent = new member, GTC-159/160). */
  personEventId?: string;
  name: string;
  email: string;
  phone: string;
  /** GTC-172 (C1): helper rows only — explicit adult-roling (§10.6). Off by default. */
  adultRoled?: boolean;
}

let formIdCounter = 0;
const emptyGuest = (): GuestForm => ({
  id: `f-${++formIdCounter}`,
  name: '',
  email: '',
  phone: '',
  adultRoled: false,
});

export default function Moment1InputForm({
  eventName,
  onComplete,
  onAddPerson,
  editingHousehold,
  onEditSave,
  onCancelEdit,
  totalPeopleCount,
  channelCandidates = [],
  hostMode,
  onSaveHostHousehold,
}: Moment1InputFormProps) {
  // Primary contact
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Household members
  const [showPartner, setShowPartner] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerPersonEventId, setPartnerPersonEventId] = useState<string | undefined>(undefined);
  const [partnerEmailError, setPartnerEmailError] = useState('');
  const [partnerPhoneError, setPartnerPhoneError] = useState('');

  const [helpers, setHelpers] = useState<GuestForm[]>([]);
  const [helperErrors, setHelperErrors] = useState<
    { name?: string; email?: string; phone?: string }[]
  >([]);

  const [showLittles, setShowLittles] = useState(false);
  const [littleCount, setLittleCount] = useState(1);

  /**
   * GTC-172 (C1): the household contact picker (§10.7) — "who should Gather talk to
   * for this household?". null means "not picked", which resolves to the primary
   * contact at read time. One decision per household, not a matrix: Moment 1 stays
   * light.
   */
  const [contactPersonEventId, setContactPersonEventId] = useState<string | null>(null);

  /**
   * GTC-256 (Ruling 2): "I'm hosting alone" — an explicit choice that produces a
   * HOUSEHOLD OF ONE, not an absence. Defaulting to the ordinary form is safe because
   * the two converge: a host who names nobody is already a household of one. The toggle
   * exists so she can say it plainly and stop being asked.
   */
  const [hostingAlone, setHostingAlone] = useState(false);

  /**
   * GTC-256 (Ruling 6): whether her household's messages send. Starts MUTED, matching
   * resolveHouseholdMuted's computed default for her household — the ruling's intent,
   * which Ruling 7's mechanism would otherwise have defaulted the other way.
   */
  const [messagesMuted, setMessagesMuted] = useState(true);

  const [guests, setGuests] = useState<GuestForm[]>([]);
  const [guestErrors, setGuestErrors] = useState<{ email?: string; phone?: string }[]>([]);

  // Unified ordering: newest-first across all named member types
  const [memberOrder, setMemberOrder] = useState<
    Array<{ type: 'partner' | 'helper' | 'guest'; id: string }>
  >([]);

  // Progress — use external count if provided, fallback to internal
  const [internalPeopleAdded, setInternalPeopleAdded] = useState(0);
  const totalPeopleAdded = totalPeopleCount ?? internalPeopleAdded;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Edit mode
  const isEditing = !!editingHousehold;

  /**
   * GTC-256 (Ruling 6): the switch belongs to the host's own household, and she must be
   * able to CHANGE HER MIND — a choice she could only make once, at capture, would not be
   * the control the ruling describes. So it renders both while capturing her household
   * (`hostMode`) and whenever she later edits it from the card list.
   */
  const isHostHouseholdForm = !!hostMode || !!editingHousehold?.isHostHousehold;

  // Track unsaved input for beforeunload
  const hasUnsavedInput = name.trim().length > 0;

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // GTC-256: prefill from the host's own Person. `POST /api/events` seeds her name as
  // `email.split('@')[0]`, so this is usually a placeholder she is expected to correct —
  // which is why the field stays editable while the email does not. Depends on the
  // primitives rather than the object, which is a new identity on every parent render.
  useEffect(() => {
    if (!hostMode) return;
    setName(hostMode.name ?? '');
    setEmail(hostMode.email ?? '');
    setPhone(hostMode.phone ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostMode?.name, hostMode?.email, hostMode?.phone]);

  // Populate form when editingHousehold changes
  useEffect(() => {
    if (!editingHousehold) return;
    setName(editingHousehold.primaryContact.name);
    setEmail(editingHousehold.primaryContact.email || '');
    setPhone(editingHousehold.primaryContact.phone || '');
    setNameError('');
    setEmailError('');
    setPhoneError('');

    const editOrder: Array<{ type: 'partner' | 'helper' | 'guest'; id: string }> = [];

    if (editingHousehold.partner) {
      setShowPartner(true);
      setPartnerName(editingHousehold.partner.name);
      setPartnerEmail(editingHousehold.partner.email || '');
      setPartnerPhone(editingHousehold.partner.phone || '');
      setPartnerPersonEventId(editingHousehold.partner.personEventId);
      editOrder.push({ type: 'partner', id: 'partner' });
    } else {
      setShowPartner(false);
      setPartnerName('');
      setPartnerEmail('');
      setPartnerPhone('');
      setPartnerPersonEventId(undefined);
    }
    setPartnerEmailError('');
    setPartnerPhoneError('');

    if (editingHousehold.helpers.length > 0) {
      const loadedHelpers = editingHousehold.helpers.map((h) => ({
        id: `f-${++formIdCounter}`,
        personEventId: h.personEventId,
        name: h.name,
        email: h.email || '',
        phone: h.phone || '',
        adultRoled: h.adultRoled ?? false,
      }));
      setHelpers(loadedHelpers);
      setHelperErrors(editingHousehold.helpers.map(() => ({})));
      loadedHelpers.forEach((h) => editOrder.push({ type: 'helper', id: h.id }));
    } else {
      setHelpers([]);
      setHelperErrors([]);
    }

    if (editingHousehold.littleCount > 0) {
      setShowLittles(true);
      setLittleCount(editingHousehold.littleCount);
    } else {
      setShowLittles(false);
      setLittleCount(1);
    }

    if (editingHousehold.guests.length > 0) {
      const loadedGuests = editingHousehold.guests.map((g) => ({
        id: `f-${++formIdCounter}`,
        personEventId: g.personEventId,
        name: g.name,
        email: g.email || '',
        phone: g.phone || '',
      }));
      setGuests(loadedGuests);
      setGuestErrors(editingHousehold.guests.map(() => ({})));
      loadedGuests.forEach((g) => editOrder.push({ type: 'guest', id: g.id }));
    } else {
      setGuests([]);
      setGuestErrors([]);
    }

    setContactPersonEventId(editingHousehold.contactPersonEventId ?? null);
    // GTC-256 (Ruling 6): NULL is "not chosen", and for her household that resolves to
    // MUTED — so an unchosen switch renders unticked, matching what the server will do.
    setMessagesMuted(editingHousehold.messagesMuted ?? true);

    setMemberOrder(editOrder);

    nameInputRef.current?.focus();
  }, [editingHousehold]);

  // Warn on navigate away with unsaved input
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedInput) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedInput]);

  const validateEmail = (value: string): string => {
    if (!value) return '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Invalid email format';
    return '';
  };

  const validatePhone = (value: string): string => {
    if (!value) return '';
    if (isInternationalNumber(value)) {
      return 'International numbers not supported yet. NZ numbers only.';
    }
    const normalized = normalizePhoneNumber(value);
    if (!normalized) return 'Invalid NZ phone number';
    return '';
  };

  const resetForm = useCallback(() => {
    setName('');
    setEmail('');
    setPhone('');
    setNameError('');
    setEmailError('');
    setPhoneError('');
    setShowPartner(false);
    setPartnerName('');
    setPartnerEmail('');
    setPartnerPhone('');
    setPartnerPersonEventId(undefined);
    setPartnerEmailError('');
    setPartnerPhoneError('');
    setHelpers([]);
    setHelperErrors([]);
    setShowLittles(false);
    setLittleCount(1);
    setGuests([]);
    setGuestErrors([]);
    setMemberOrder([]);
    nameInputRef.current?.focus();
  }, []);

  const hasValidationErrors = (): boolean => {
    let hasErrors = false;

    // Primary contact name required
    if (!name.trim()) {
      setNameError('Name is required');
      hasErrors = true;
    } else {
      setNameError('');
    }

    // Validate primary email/phone if provided
    const eErr = validateEmail(email);
    setEmailError(eErr);
    if (eErr) hasErrors = true;

    const pErr = validatePhone(phone);
    setPhoneError(pErr);
    if (pErr) hasErrors = true;

    // Validate partner email/phone if provided
    if (showPartner) {
      const peErr = validateEmail(partnerEmail);
      setPartnerEmailError(peErr);
      if (peErr) hasErrors = true;

      const ppErr = validatePhone(partnerPhone);
      setPartnerPhoneError(ppErr);
      if (ppErr) hasErrors = true;
    }

    // Validate helper names and emails/phones
    const newHelperErrors = helpers.map((h) => ({
      name: !h.name.trim() ? 'Name is required' : undefined,
      email: validateEmail(h.email) || undefined,
      phone: validatePhone(h.phone) || undefined,
    }));
    setHelperErrors(newHelperErrors);
    if (newHelperErrors.some((e) => e.name || e.email || e.phone)) hasErrors = true;

    // Validate guest emails/phones
    const newGuestErrors = guests.map((g) => ({
      email: validateEmail(g.email) || undefined,
      phone: validatePhone(g.phone) || undefined,
    }));
    setGuestErrors(newGuestErrors);
    if (newGuestErrors.some((e) => e.email || e.phone)) hasErrors = true;

    return hasErrors;
  };

  const buildPayload = (): Moment1PersonInput => {
    const payload: Moment1PersonInput = {
      primaryContact: {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      },
    };

    if (showPartner && partnerName.trim()) {
      payload.partner = {
        personEventId: partnerPersonEventId,
        name: partnerName.trim(),
        email: partnerEmail.trim() || undefined,
        phone: partnerPhone.trim() || undefined,
      };
    }

    const namedHelpers = helpers.filter((h) => h.name.trim());
    if (namedHelpers.length > 0) {
      payload.helpers = namedHelpers.map((h) => ({
        personEventId: h.personEventId,
        name: h.name.trim(),
        email: h.email.trim() || undefined,
        phone: h.phone.trim() || undefined,
        // GTC-172 (C1): explicit, never derived from h.phone being present (§10.6).
        adultRoled: h.adultRoled ?? false,
      }));
    }

    if (showLittles && littleCount > 0) {
      payload.littleCount = littleCount;
    }

    // GTC-172 (C1): always sent, so clearing the picker back to the default (null)
    // round-trips rather than being read as "leave it alone".
    payload.contactPersonEventId = contactPersonEventId;

    // GTC-256 (Ruling 6): sent only for HER household, so every other household's PUT
    // leaves the column untouched (build decision 3 of the proposal: the column exists
    // everywhere, the control exists in one place).
    if (isHostHouseholdForm) payload.messagesMuted = messagesMuted;

    const namedGuests = guests.filter((g) => g.name.trim());
    if (namedGuests.length > 0) {
      payload.guests = namedGuests.map((g) => ({
        personEventId: g.personEventId,
        name: g.name.trim(),
        email: g.email.trim() || undefined,
        phone: g.phone.trim() || undefined,
      }));
    }

    return payload;
  };

  const countMembers = (payload: Moment1PersonInput): number => {
    let count = 1; // primary contact
    if (payload.partner?.name) count++;
    if (payload.helpers) count += payload.helpers.length;
    if (payload.littleCount) count += payload.littleCount;
    if (payload.guests) count += payload.guests.length;
    return count;
  };

  const handleAddAnother = async () => {
    if (hasValidationErrors()) return;

    setSaving(true);
    setSaveError(false);
    try {
      const payload = buildPayload();
      await onAddPerson(payload);
      if (totalPeopleCount === undefined) {
        setInternalPeopleAdded((prev) => prev + countMembers(payload));
      }
      resetForm();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingHousehold || !onEditSave) return;
    if (hasValidationErrors()) return;

    setSaving(true);
    try {
      const payload = buildPayload();
      await onEditSave(editingHousehold.id, payload);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDone = async () => {
    // If there's a name typed, save it first
    if (name.trim()) {
      if (hasValidationErrors()) return;

      setSaving(true);
      setSaveError(false);
      try {
        const payload = buildPayload();
        await onAddPerson(payload);
        if (totalPeopleCount === undefined) {
          setInternalPeopleAdded((prev) => prev + countMembers(payload));
        }
      } catch {
        setSaveError(true);
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    onComplete();
  };

  /**
   * GTC-256 (phase 2) — save the host's own household.
   *
   * `alone` collapses the payload rather than merely hiding the fields, so a partner she
   * typed and then abandoned by choosing "hosting alone" is not silently captured. And
   * an alone household is sent MUTED unconditionally: a household of one has no
   * household messages, only messages about herself (the founder's Ruling-6 safety,
   * which resolveHouseholdMuted also enforces at read time so the UI is not the only
   * thing holding it).
   */
  const handleSaveHostHousehold = async () => {
    if (!onSaveHostHousehold) return;
    if (hasValidationErrors()) return;

    setSaving(true);
    setSaveError(false);
    try {
      const base = buildPayload();
      await onSaveHostHousehold({
        alone: hostingAlone,
        name: base.primaryContact.name,
        phone: base.primaryContact.phone,
        partner: hostingAlone ? undefined : base.partner,
        helpers: hostingAlone ? undefined : base.helpers,
        littleCount: hostingAlone ? 0 : base.littleCount,
        guests: hostingAlone ? undefined : base.guests,
        messagesMuted: hostingAlone ? true : messagesMuted,
      });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  /**
   * GTC-256 (Ruling 6): does she have anyone in her household for Gather to talk to her
   * ABOUT? Counted on named members and never on `littleCount` — kids without jobs have
   * no PersonEvent, so they are not people a household nudge could be about, and
   * resolveHouseholdMuted counts member rows for exactly the same reason.
   */
  const hostHasOtherMembers =
    (showPartner && partnerName.trim().length > 0) ||
    helpers.some((h) => h.name.trim().length > 0) ||
    guests.some((g) => g.name.trim().length > 0);

  const addGuest = () => {
    const g = emptyGuest();
    setGuests((prev) => [g, ...prev]);
    setGuestErrors((prev) => [{}, ...prev]);
    setMemberOrder((prev) => [{ type: 'guest' as const, id: g.id }, ...prev]);
  };

  const removeGuest = (index: number) => {
    const removed = guests[index];
    setGuests((prev) => prev.filter((_, i) => i !== index));
    setGuestErrors((prev) => prev.filter((_, i) => i !== index));
    if (removed) setMemberOrder((prev) => prev.filter((m) => m.id !== removed.id));
  };

  const updateGuest = (index: number, field: keyof GuestForm, value: string) => {
    setGuests((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };

  return (
    <div>
      <div className="max-w-[640px]">
        {/* MomentArc */}
        <div className="mb-8">
          <MomentArc currentMoment={1} />
        </div>

        {/* Assistant line */}
        {hostMode ? (
          /* GTC-256 (Ruling 1): "the host is at her own party" — the reason this screen
             exists at all, said to her in her own words rather than left implicit. */
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              First — you&rsquo;re at {eventName} too.
            </h2>
            <p className="text-lg text-gray-600 mb-2">
              Let&rsquo;s start with your own household. You&rsquo;re eating, so you count — and
              everyone you add after this gets added around you.
            </p>
          </>
        ) : (
          <p className="text-lg text-gray-600 mb-2">
            Who&rsquo;s coming to {eventName}? Add them here — just a name and how to reach them.
            You can sort out what they&rsquo;re bringing later.
          </p>
        )}

        {/* Progress counter */}
        {!hostMode && totalPeopleAdded > 0 && (
          <p className="text-sm text-gray-400 mb-6">
            {totalPeopleAdded} {totalPeopleAdded === 1 ? 'person' : 'people'} added.
          </p>
        )}

        {(hostMode || totalPeopleAdded === 0) && <div className="mb-6" />}

        {/* Form container */}
        <div className="border border-gray-200 bg-white rounded-xl p-6">
          {/* Primary contact form */}
          <div className="space-y-4 mb-6">
            <div>
              <label htmlFor="m1-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="m1-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                  if (saveError) setSaveError(false);
                }}
                placeholder="e.g. Sarah Mitchell"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                  nameError ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {nameError && <p className="text-sm text-red-500 mt-1">{nameError}</p>}
            </div>

            {hostMode ? (
              /* GTC-256 (Ruling 10): this is her ACCOUNT email — `Person.email` is @unique
                 and is what joins her Person to her User. The server never reads it from
                 this payload, so showing it read-only is the honest rendering of what is
                 actually editable, not a restriction invented in the markup. */
              <div>
                <label
                  htmlFor="m1-host-email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="m1-host-email"
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your account email — it&rsquo;s how this event stays yours.
                </p>
              </div>
            ) : (
              <SkipForNowField
                id="m1-email"
                label="Email"
                type="email"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError('');
                }}
                onBlur={() => setEmailError(validateEmail(email))}
                error={emailError}
                placeholder="email@example.com"
              />
            )}

            <SkipForNowField
              id="m1-phone"
              label="Phone"
              type="tel"
              value={phone}
              onChange={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError('');
              }}
              onBlur={() => setPhoneError(validatePhone(phone))}
              error={phoneError}
              placeholder="021 123 4567"
            />
          </div>

          {/* GTC-256 (Ruling 2) — "I'm hosting alone", offered explicitly.
              "No household" and "a household containing only me" are DIFFERENT FACTS and
              only the second survives Ruling 3: a host who declines to name anyone else
              must still appear in the headcount, hold items, and be excluded from her own
              ask. So this collapses the form; it never opts her out of having one. */}
          {hostMode && (
            <div className="border-t border-gray-200 pt-6 mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hostingAlone}
                  onChange={(e) => setHostingAlone(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                />
                <span>
                  <span className="text-sm font-medium text-gray-700">I&rsquo;m hosting alone</span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Just you in your household. You&rsquo;ll still be counted and fed — you can add
                    everyone else on the next screen.
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Household members section */}
          <div className={`border-t border-gray-200 pt-6 mb-6 ${hostingAlone ? 'hidden' : ''}`}>
            <p className="text-sm text-gray-500 mb-4">
              {hostMode ? 'Anyone else in your household?' : 'Anyone else in this group?'}
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              {!showPartner && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPartner(true);
                    setMemberOrder((prev) => [
                      { type: 'partner' as const, id: 'partner' },
                      ...prev,
                    ]);
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  👫 Add Partner
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const h = emptyGuest();
                  setHelpers((prev) => [h, ...prev]);
                  setHelperErrors((prev) => [{}, ...prev]);
                  setMemberOrder((prev) => [{ type: 'helper' as const, id: h.id }, ...prev]);
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                👦 Kid with a job
              </button>
              {!showLittles && (
                <button
                  type="button"
                  onClick={() => setShowLittles(true)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  🧒 Kid without a job
                </button>
              )}
              <button
                type="button"
                onClick={addGuest}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                👤 Add Guest
              </button>
            </div>

            {/* Members list — ordered by memberOrder (newest first) */}
            {memberOrder.map((entry, orderIdx) => {
              if (entry.type === 'partner' && showPartner) {
                return (
                  <SubForm
                    key="partner"
                    title="Partner"
                    onRemove={() => {
                      setShowPartner(false);
                      setPartnerName('');
                      setPartnerEmail('');
                      setPartnerPhone('');
                      setPartnerPersonEventId(undefined);
                      setPartnerEmailError('');
                      setPartnerPhoneError('');
                      setMemberOrder((prev) => prev.filter((m) => m.id !== 'partner'));
                    }}
                  >
                    <input
                      type="text"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="Partner's name"
                      autoFocus={orderIdx === 0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <div>
                      <input
                        type="email"
                        value={partnerEmail}
                        onChange={(e) => {
                          setPartnerEmail(e.target.value);
                          if (partnerEmailError) setPartnerEmailError('');
                        }}
                        onBlur={() => setPartnerEmailError(validateEmail(partnerEmail))}
                        placeholder="Email"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          partnerEmailError ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {partnerEmailError && (
                        <p className="text-sm text-red-500 mt-1">{partnerEmailError}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="tel"
                        value={partnerPhone}
                        onChange={(e) => {
                          setPartnerPhone(e.target.value);
                          if (partnerPhoneError) setPartnerPhoneError('');
                        }}
                        onBlur={() => setPartnerPhoneError(validatePhone(partnerPhone))}
                        placeholder="Phone"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          partnerPhoneError ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {partnerPhoneError && (
                        <p className="text-sm text-red-500 mt-1">{partnerPhoneError}</p>
                      )}
                    </div>
                  </SubForm>
                );
              }

              if (entry.type === 'helper') {
                const i = helpers.findIndex((h) => h.id === entry.id);
                if (i === -1) return null;
                const helper = helpers[i];
                return (
                  <SubForm
                    key={helper.id}
                    title={`Kid with a job${helpers.length > 1 ? ` ${i + 1}` : ''}`}
                    onRemove={() => {
                      setHelpers((prev) => prev.filter((_, j) => j !== i));
                      setHelperErrors((prev) => prev.filter((_, j) => j !== i));
                      setMemberOrder((prev) => prev.filter((m) => m.id !== helper.id));
                    }}
                  >
                    <div>
                      <input
                        type="text"
                        value={helper.name}
                        onChange={(e) => {
                          setHelpers((prev) =>
                            prev.map((h, j) => (j === i ? { ...h, name: e.target.value } : h))
                          );
                          if (helperErrors[i]?.name) {
                            setHelperErrors((prev) =>
                              prev.map((err, j) => (j === i ? { ...err, name: undefined } : err))
                            );
                          }
                        }}
                        placeholder="Kid's name"
                        autoFocus={orderIdx === 0}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          helperErrors[i]?.name ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {helperErrors[i]?.name && (
                        <p className="text-sm text-red-500 mt-1">{helperErrors[i].name}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="email"
                        value={helper.email}
                        onChange={(e) => {
                          setHelpers((prev) =>
                            prev.map((h, j) => (j === i ? { ...h, email: e.target.value } : h))
                          );
                          if (helperErrors[i]?.email) {
                            setHelperErrors((prev) =>
                              prev.map((err, j) => (j === i ? { ...err, email: undefined } : err))
                            );
                          }
                        }}
                        onBlur={() => {
                          const err = validateEmail(helper.email);
                          setHelperErrors((prev) =>
                            prev.map((e, j) => (j === i ? { ...e, email: err || undefined } : e))
                          );
                        }}
                        placeholder="Email"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          helperErrors[i]?.email ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {helperErrors[i]?.email && (
                        <p className="text-sm text-red-500 mt-1">{helperErrors[i].email}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="tel"
                        value={helper.phone}
                        onChange={(e) => {
                          setHelpers((prev) =>
                            prev.map((h, j) => (j === i ? { ...h, phone: e.target.value } : h))
                          );
                          if (helperErrors[i]?.phone) {
                            setHelperErrors((prev) =>
                              prev.map((err, j) => (j === i ? { ...err, phone: undefined } : err))
                            );
                          }
                        }}
                        onBlur={() => {
                          const err = validatePhone(helper.phone);
                          setHelperErrors((prev) =>
                            prev.map((e, j) => (j === i ? { ...e, phone: err || undefined } : e))
                          );
                        }}
                        placeholder="Phone"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          helperErrors[i]?.phone ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {helperErrors[i]?.phone && (
                        <p className="text-sm text-red-500 mt-1">{helperErrors[i].phone}</p>
                      )}
                    </div>
                    {/*
                      GTC-172 (C1) — the explicit adult-roling path (Moment 4 §10.6).
                      Kids never get messages, whatever contact details are on the row.
                      This is the ONE way that changes, and it is a deliberate hosting
                      decision: off by default, never pre-ticked, never inferred from
                      the presence of a phone number.
                    */}
                    <div className="pt-1">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={helper.adultRoled ?? false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setHelpers((prev) =>
                              prev.map((h, j) => (j === i ? { ...h, adultRoled: checked } : h))
                            );
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                        />
                        <span className="text-sm text-gray-600">
                          Old enough to message directly
                          <span className="block text-xs text-gray-400">
                            Kids never get messages from Gather. Tick this only if{' '}
                            {helper.name.trim() || 'this young person'} should hear from us directly
                            rather than through an adult.
                          </span>
                        </span>
                      </label>
                    </div>
                  </SubForm>
                );
              }

              if (entry.type === 'guest') {
                const i = guests.findIndex((g) => g.id === entry.id);
                if (i === -1) return null;
                const guest = guests[i];
                return (
                  <SubForm key={guest.id} title={`Guest ${i + 1}`} onRemove={() => removeGuest(i)}>
                    <input
                      type="text"
                      value={guest.name}
                      onChange={(e) => updateGuest(i, 'name', e.target.value)}
                      placeholder="Guest's name"
                      autoFocus={orderIdx === 0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <div>
                      <input
                        type="email"
                        value={guest.email}
                        onChange={(e) => {
                          updateGuest(i, 'email', e.target.value);
                          if (guestErrors[i]?.email) {
                            setGuestErrors((prev) =>
                              prev.map((err, j) => (j === i ? { ...err, email: undefined } : err))
                            );
                          }
                        }}
                        onBlur={() => {
                          const err = validateEmail(guest.email);
                          setGuestErrors((prev) =>
                            prev.map((e, j) => (j === i ? { ...e, email: err || undefined } : e))
                          );
                        }}
                        placeholder="Email"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          guestErrors[i]?.email ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {guestErrors[i]?.email && (
                        <p className="text-sm text-red-500 mt-1">{guestErrors[i].email}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="tel"
                        value={guest.phone}
                        onChange={(e) => {
                          updateGuest(i, 'phone', e.target.value);
                          if (guestErrors[i]?.phone) {
                            setGuestErrors((prev) =>
                              prev.map((err, j) => (j === i ? { ...err, phone: undefined } : err))
                            );
                          }
                        }}
                        onBlur={() => {
                          const err = validatePhone(guest.phone);
                          setGuestErrors((prev) =>
                            prev.map((e, j) => (j === i ? { ...e, phone: err || undefined } : e))
                          );
                        }}
                        placeholder="Phone"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                          guestErrors[i]?.phone ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                      {guestErrors[i]?.phone && (
                        <p className="text-sm text-red-500 mt-1">{guestErrors[i].phone}</p>
                      )}
                    </div>
                  </SubForm>
                );
              }

              return null;
            })}

            {/* Kids without jobs input — always at bottom */}
            {showLittles && (
              <div className="border-l-4 border-blue-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">Kids without jobs</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLittles(false);
                      setLittleCount(1);
                    }}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    × remove
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">How many kids without jobs?</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={littleCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 20) setLittleCount(val);
                    }}
                    autoFocus
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
            )}

            {/*
              GTC-172 (C1) — the household contact picker (Moment 4 §10.7).
              ONE decision per household, not a matrix: Moment 1 stays light. It is
              cross-household capable, so the options span the whole event — Grandma's
              channel may live in her daughter's household. Children are not offered.
            */}
            {!hostMode && channelCandidates.length > 0 && (
              <div className="border-l-4 border-gray-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md">
                <label
                  htmlFor="household-channel"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Who should Gather talk to for this household?
                </label>
                <select
                  id="household-channel"
                  value={contactPersonEventId ?? ''}
                  onChange={(e) => setContactPersonEventId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">
                    {name.trim() ? `${name.trim()} (main contact)` : 'The main contact'}
                  </option>
                  {channelCandidates
                    .filter((c) => c.householdId !== editingHousehold?.id)
                    .map((c) => (
                      <option key={c.personEventId} value={c.personEventId}>
                        {c.name} — {c.householdName}&rsquo;s household
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Everything for this household goes to one person. Leave it on the main contact
                  unless someone else is the better ear.
                </p>
              </div>
            )}
          </div>

          {/* GTC-256 (Ruling 6) — THE HOUSEHOLD MESSAGE SWITCH.
              "The host may be her household's contact, AND CHOOSES WHETHER THOSE MESSAGES
              SEND." Separate from Ruling 5, which suppresses her own ask because of what
              she IS; this is a setting she controls about her household.
              It ships here rather than later because Ruling 7 makes her her household's
              proxy channel by default (a null pick resolves to the PRIMARY_CONTACT), so
              without it the send path is live on her from the first event — Ruling 11. */}
          {isHostHouseholdForm && !hostingAlone && (
            <div className="border-t border-gray-200 pt-6">
              {hostHasOtherMembers ? (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!messagesMuted}
                    onChange={(e) => setMessagesMuted(!e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span>
                    <span className="text-sm font-medium text-gray-700">
                      Message me about my own household
                    </span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      Gather talks to one person per household, and for yours that&rsquo;s you.
                      Leave this off and it won&rsquo;t chase you about the people at your own
                      table.
                    </span>
                  </span>
                </label>
              ) : (
                /* The founder's Ruling-6 safety, said plainly rather than shown as a
                   control that would do nothing: a household of one has no household
                   messages, only messages about herself. resolveHouseholdMuted enforces
                   the same rule at read time, so adding a partner and then removing them
                   again cannot leave a stored "send" behind. */
                <p className="text-xs text-gray-400">
                  There&rsquo;s nobody in your household for Gather to chase yet, so it won&rsquo;t
                  message you about it. Add someone above and you can choose.
                </p>
              )}
            </div>
          )}
        </div>
        {/* end form container */}

        {/* Save actions */}
        <div className="mt-6">
          {saveError && (
            <p className="text-red-600 text-sm mb-3">That didn&rsquo;t save — please try again.</p>
          )}
          {hostMode ? (
            <button
              type="button"
              onClick={handleSaveHostHousehold}
              disabled={saving}
              className="w-full py-3 text-white font-medium bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save and add everyone else →'}
            </button>
          ) : isEditing ? (
            <>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={saving}
                className="w-full py-3 text-white font-medium bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50 mb-4"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {onCancelEdit && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onCancelEdit();
                  }}
                  disabled={saving}
                  className="w-full py-3 text-gray-600 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAddAnother}
                disabled={saving}
                className="w-full py-3 text-accent font-medium border-2 border-dashed border-accent/30 rounded-lg hover:bg-accent/5 transition-colors disabled:opacity-50 mb-4"
              >
                {saving ? 'Saving…' : 'Save & add another'}
              </button>

              <button
                type="button"
                onClick={handleDone}
                disabled={saving}
                className="w-full py-3 text-gray-600 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Save & move on →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function SubForm({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-4 border-blue-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <button
          type="button"
          onClick={onRemove}
          className="text-sm text-red-500 hover:text-red-700"
        >
          × remove
        </button>
      </div>
      {children}
    </div>
  );
}

function SkipForNowField({
  id,
  label,
  type,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error: string;
  placeholder: string;
}) {
  const [showSkip, setShowSkip] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        {showSkip && !value && <span className="text-xs text-gray-400">Skip for now →</span>}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          onBlur();
          setShowSkip(true);
        }}
        onFocus={() => setShowSkip(false)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
          error ? 'border-red-400' : 'border-gray-300'
        }`}
      />
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
