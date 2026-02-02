'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@/contexts/ModalContext';
import { normalizePhoneNumber, isInternationalNumber } from '@/lib/phone';

interface Team {
  id: string;
  name: string;
}

export interface AddPersonFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  teamId: string | null;
}

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: AddPersonFormData) => Promise<void>;
  teams: Team[];
  stepLabel?: string;
}

export default function AddPersonModal({
  isOpen,
  onClose,
  onAdd,
  teams,
  stepLabel,
}: AddPersonModalProps) {
  const { openModal, closeModal } = useModal();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [role, setRole] = useState('PARTICIPANT');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addedPeople, setAddedPeople] = useState<
    Array<{ name: string; team: string; role: string }>
  >([]);

  // Detect platform for keyboard shortcut display
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

  const validatePhone = (value: string): boolean => {
    if (!value.trim()) {
      setPhoneError('');
      return true; // Optional field
    }

    if (isInternationalNumber(value)) {
      setPhoneError('International numbers not supported yet. NZ numbers only.');
      return false;
    }

    const normalized = normalizePhoneNumber(value);
    if (!normalized) {
      setPhoneError('Please enter a valid NZ mobile number (e.g., 021 123 4567)');
      return false;
    }

    setPhoneError('');
    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (!validatePhone(phone)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const addedName = name.trim();
      const normalizedPhone = phone.trim() ? normalizePhoneNumber(phone) : null;

      await onAdd({
        name: addedName,
        email: email.trim(),
        phone: normalizedPhone || '',
        role,
        teamId,
      });

      // Add to list of added people
      const teamName = teamId
        ? teams.find((t) => t.id === teamId)?.name || 'Unassigned'
        : 'Unassigned';
      setAddedPeople((prev) => [...prev, { name: addedName, team: teamName, role }]);

      // Show success message
      setSuccessMessage(`${addedName} added successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reset form but keep modal open
      setName('');
      setEmail('');
      setPhone('');
      setRole('PARTICIPANT');
      setTeamId(null);

      // Refocus name input for next entry
      setTimeout(() => {
        const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        nameInput?.focus();
      }, 100);
    } catch (error: any) {
      console.error('Error adding person:', error);
      alert(error.message || 'Failed to add person');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setAddedPeople([]);
    closeModal();
    onClose();
  };

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('add-person-modal')) {
        // Blocked by expansion modal
        onClose();
      }
    } else {
      closeModal();
    }
  }, [isOpen]);

  // Keyboard shortcut: Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!isSubmitting && name.trim()) {
          // Trigger form submission
          const form = document.querySelector('form');
          if (form) {
            form.requestSubmit();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, name]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            {stepLabel && <p className="text-xs text-gray-400 mb-1">{stepLabel}</p>}
            <h2 className="text-lg font-semibold text-gray-900">Add People</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Side - Form */}
          <div className="flex-1 overflow-y-auto">
            {/* Success Message - Always reserve space to prevent jumping */}
            <div className="mx-4 mt-4 h-14 flex items-center">
              <div
                className={`w-full transition-opacity duration-200 ${successMessage ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">{successMessage || '\u00A0'}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., John Smith"
                  required
                  autoFocus
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., john@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => validatePhone(phone)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                    phoneError ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="021 123 4567"
                />
                {phoneError && <p className="text-sm text-red-500 mt-1">{phoneError}</p>}
                <p className="text-xs text-gray-500 mt-1">
                  Used for automatic reminders. NZ mobile numbers only.
                </p>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="COORDINATOR">Coordinator</option>
                  <option value="PARTICIPANT">Participant</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Coordinators lead teams. Participants help with items.
                </p>
              </div>

              {/* Team */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select
                  value={teamId || ''}
                  onChange={(e) => setTeamId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Unassigned</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">You can assign people to teams later.</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Adding...' : 'Add Person'}
                  <span className="ml-2 text-xs opacity-75">({isMac ? '⌘' : 'Ctrl'}+↵)</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-gray-500 text-center -mt-2">
                Modal will stay open • Press {isMac ? '⌘' : 'Ctrl'}+Enter to add quickly
              </p>
            </form>
          </div>

          {/* Right Side - Added People List */}
          <div className="w-80 border-l bg-gray-50 overflow-y-auto">
            <div className="p-4 border-b bg-white sticky top-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Added This Session ({addedPeople.length})
              </h3>
            </div>
            <div className="p-4">
              {addedPeople.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <p>No people added yet.</p>
                  <p className="mt-1">Start adding people to see them here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {addedPeople.map((person, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-md p-3 shadow-sm"
                    >
                      <p className="font-medium text-gray-900 text-sm">{person.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-600">{person.team}</span>
                        <span className="text-xs text-gray-400">•</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            person.role === 'COORDINATOR'
                              ? 'bg-sage-100 text-sage-700'
                              : 'bg-sage-100 text-sage-700'
                          }`}
                        >
                          {person.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
