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
    name?: string;
    email?: string;
    phone?: string;
  };
  childCount?: number;
  guests?: Array<{
    name?: string;
    email?: string;
    phone?: string;
  }>;
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
}

interface GuestForm {
  name: string;
  email: string;
  phone: string;
}

const emptyGuest = (): GuestForm => ({ name: '', email: '', phone: '' });

export default function Moment1InputForm({
  eventName,
  onComplete,
  onAddPerson,
  editingHousehold,
  onEditSave,
  onCancelEdit,
  totalPeopleCount,
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
  const [partnerEmailError, setPartnerEmailError] = useState('');
  const [partnerPhoneError, setPartnerPhoneError] = useState('');

  const [showChildren, setShowChildren] = useState(false);
  const [childCount, setChildCount] = useState(1);
  const [childCountConfirmed, setChildCountConfirmed] = useState(false);

  const [guests, setGuests] = useState<GuestForm[]>([]);
  const [guestErrors, setGuestErrors] = useState<{ email?: string; phone?: string }[]>([]);

  // Progress — use external count if provided, fallback to internal
  const [internalPeopleAdded, setInternalPeopleAdded] = useState(0);
  const totalPeopleAdded = totalPeopleCount ?? internalPeopleAdded;
  const [saving, setSaving] = useState(false);

  // Edit mode
  const isEditing = !!editingHousehold;

  // Track unsaved input for beforeunload
  const hasUnsavedInput = name.trim().length > 0;

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Populate form when editingHousehold changes
  useEffect(() => {
    if (!editingHousehold) return;
    setName(editingHousehold.primaryContact.name);
    setEmail(editingHousehold.primaryContact.email || '');
    setPhone(editingHousehold.primaryContact.phone || '');
    setNameError('');
    setEmailError('');
    setPhoneError('');

    if (editingHousehold.partner) {
      setShowPartner(true);
      setPartnerName(editingHousehold.partner.name);
      setPartnerEmail(editingHousehold.partner.email || '');
      setPartnerPhone(editingHousehold.partner.phone || '');
    } else {
      setShowPartner(false);
      setPartnerName('');
      setPartnerEmail('');
      setPartnerPhone('');
    }
    setPartnerEmailError('');
    setPartnerPhoneError('');

    if (editingHousehold.childCount > 0) {
      setShowChildren(true);
      setChildCount(editingHousehold.childCount);
      setChildCountConfirmed(true);
    } else {
      setShowChildren(false);
      setChildCount(1);
      setChildCountConfirmed(false);
    }

    if (editingHousehold.guests.length > 0) {
      setGuests(
        editingHousehold.guests.map((g) => ({
          name: g.name,
          email: g.email || '',
          phone: g.phone || '',
        }))
      );
      setGuestErrors(editingHousehold.guests.map(() => ({})));
    } else {
      setGuests([]);
      setGuestErrors([]);
    }

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
    setPartnerEmailError('');
    setPartnerPhoneError('');
    setShowChildren(false);
    setChildCount(1);
    setChildCountConfirmed(false);
    setGuests([]);
    setGuestErrors([]);
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
        name: partnerName.trim(),
        email: partnerEmail.trim() || undefined,
        phone: partnerPhone.trim() || undefined,
      };
    }

    if (childCountConfirmed && childCount > 0) {
      payload.childCount = childCount;
    }

    const namedGuests = guests.filter((g) => g.name.trim());
    if (namedGuests.length > 0) {
      payload.guests = namedGuests.map((g) => ({
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
    if (payload.childCount) count += payload.childCount;
    if (payload.guests) count += payload.guests.length;
    return count;
  };

  const handleAddAnother = async () => {
    if (hasValidationErrors()) return;

    setSaving(true);
    try {
      const payload = buildPayload();
      await onAddPerson(payload);
      if (totalPeopleCount === undefined) {
        setInternalPeopleAdded((prev) => prev + countMembers(payload));
      }
      resetForm();
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
      try {
        const payload = buildPayload();
        await onAddPerson(payload);
        if (totalPeopleCount === undefined) {
          setInternalPeopleAdded((prev) => prev + countMembers(payload));
        }
      } finally {
        setSaving(false);
      }
    }
    onComplete();
  };

  const addGuest = () => {
    setGuests((prev) => [...prev, emptyGuest()]);
    setGuestErrors((prev) => [...prev, {}]);
  };

  const removeGuest = (index: number) => {
    setGuests((prev) => prev.filter((_, i) => i !== index));
    setGuestErrors((prev) => prev.filter((_, i) => i !== index));
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
        <p className="text-lg text-gray-600 mb-2">
          Who&rsquo;s coming to {eventName}? Add them here — just a name and how to reach them. You
          can sort out what they&rsquo;re bringing later.
        </p>

        {/* Progress counter */}
        {totalPeopleAdded > 0 && (
          <p className="text-sm text-gray-400 mb-6">
            {totalPeopleAdded} {totalPeopleAdded === 1 ? 'person' : 'people'} added.
          </p>
        )}

        {totalPeopleAdded === 0 && <div className="mb-6" />}

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
                }}
                placeholder="e.g. Sarah Mitchell"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                  nameError ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {nameError && <p className="text-sm text-red-500 mt-1">{nameError}</p>}
            </div>

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

          {/* Household members section */}
          <div className="border-t border-gray-200 pt-6 mb-6">
            <p className="text-sm text-gray-500 mb-4">Anyone else in this group?</p>

            <div className="flex flex-wrap gap-3 mb-4">
              {!showPartner && (
                <button
                  type="button"
                  onClick={() => setShowPartner(true)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  👫 Add Partner
                </button>
              )}
              {!showChildren && !childCountConfirmed && (
                <button
                  type="button"
                  onClick={() => setShowChildren(true)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  😊 Add Children
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

            {/* Partner sub-form */}
            {showPartner && (
              <SubForm
                title="Partner"
                onRemove={() => {
                  setShowPartner(false);
                  setPartnerName('');
                  setPartnerEmail('');
                  setPartnerPhone('');
                  setPartnerEmailError('');
                  setPartnerPhoneError('');
                }}
              >
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Partner's name"
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
            )}

            {/* Children input */}
            {showChildren && !childCountConfirmed && (
              <div className="border-l-4 border-blue-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md">
                <p className="text-sm text-gray-600 mb-2">How many children?</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={childCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 20) setChildCount(val);
                    }}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setChildCountConfirmed(true)}
                    className="px-3 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-dark transition-colors"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChildren(false);
                      setChildCount(1);
                    }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {childCountConfirmed && (
              <div className="border-l-4 border-blue-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {childCount} {childCount === 1 ? 'child' : 'children'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setChildCountConfirmed(false);
                    setShowChildren(false);
                    setChildCount(1);
                  }}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  × remove
                </button>
              </div>
            )}

            {/* Guest sub-forms */}
            {guests.map((guest, i) => (
              <SubForm key={i} title={`Guest ${i + 1}`} onRemove={() => removeGuest(i)}>
                <input
                  type="text"
                  value={guest.name}
                  onChange={(e) => updateGuest(i, 'name', e.target.value)}
                  placeholder="Guest's name"
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
            ))}
          </div>
        </div>
        {/* end form container */}

        {/* Add another person / Save changes */}
        <div className="mt-6">
          {isEditing ? (
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
                {saving ? 'Saving…' : '+ Add another person'}
              </button>

              {/* Done adding people */}
              <button
                type="button"
                onClick={handleDone}
                disabled={saving}
                className="w-full py-3 text-gray-600 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Done adding people →
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
