'use client';

import { useEffect, useRef, useState } from 'react';
import MomentArc from './MomentArc';
import { useToast } from '@/contexts/ToastContext';
import { CATEGORY_LABELS } from '@/lib/ai/plan-categories';

// ─── Public types ────────────────────────────────────────────────────────────

export interface PlanItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
  dietaryFlags?: string[];
  displayOrder?: number;
}

export interface PlanCategory {
  id: string;
  name: string;
  emoji: string;
  items: PlanItem[];
}

export interface NewPlanItem {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
}

interface Moment2PlanViewProps {
  eventId: string;
  eventName: string;
  guestCount: number;
  categories: PlanCategory[];
  onUpdateItem: (itemId: string, updates: Partial<PlanItem>) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onAddItem: (categoryId: string, item: NewPlanItem) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
  onApprove: () => void;
  onBack: () => void;
  /** GTC-236 */
  onRegeneratePlan: () => void;
  onRegenerateCategory: (categoryKey: string) => void;
  /** 'plan', a categoryKey, or null when idle */
  regeneratingScope: 'plan' | string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMMON_UNITS = [
  'kg',
  'g',
  'litres',
  'ml',
  'bottles',
  'cans',
  'trays',
  'bowls',
  'plates',
  'pieces',
  'servings',
  'bags',
  'boxes',
  'packets',
  'bunches',
  'loaves',
  'dozen',
];

// GTC-236: per-category regenerate keys on the canonical category vocabulary. A team
// whose name is not in this map (custom categories, task buckets) simply gets no
// regenerate trigger.
const LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [label, key])
);

// ─── Root component ──────────────────────────────────────────────────────────

export default function Moment2PlanView({
  eventId: _eventId,
  eventName,
  guestCount,
  categories,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  onAddCategory,
  onApprove,
  onBack,
  onRegeneratePlan,
  onRegenerateCategory,
  regeneratingScope,
}: Moment2PlanViewProps) {
  const toast = useToast();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [quantityEditId, setQuantityEditId] = useState<string | null>(null);
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

  // Ruling Q2 (GTC-236): regenerate clears marks — they are staging state, and after a
  // regenerate the marked GENERATED rows no longer exist anyway.
  useEffect(() => {
    if (regeneratingScope !== null) setSelectedItemIds(new Set());
  }, [regeneratingScope]);

  const toggleCollapsed = (categoryId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleSaveEdit = async (itemId: string, updates: Partial<PlanItem>) => {
    await onUpdateItem(itemId, updates);
    setEditingItemId(null);
    toast.success('Updated.', { duration: 2000 });
  };

  const handleRemove = async (itemId: string) => {
    await onRemoveItem(itemId);
    setEditingItemId(null);
    setSelectedItemIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    toast.success('Removed.', { duration: 2000 });
  };

  const toggleSelection = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleBulkRemove = async () => {
    const ids = Array.from(selectedItemIds);
    if (ids.length === 0 || bulkRemoving) return;
    setBulkRemoving(true);
    try {
      for (const id of ids) {
        await onRemoveItem(id);
      }
      setSelectedItemIds(new Set());
      setEditingItemId(null);
      toast.success(`Removed ${ids.length} ${ids.length === 1 ? 'item' : 'items'}.`, {
        duration: 2000,
      });
    } finally {
      setBulkRemoving(false);
    }
  };

  const handleQuantitySave = async (itemId: string, newQuantity: number) => {
    await onUpdateItem(itemId, { quantity: newQuantity });
    setQuantityEditId(null);
    toast.success('Updated.', { duration: 2000 });
  };

  const handleAdd = async (categoryId: string, item: NewPlanItem) => {
    await onAddItem(categoryId, item);
    setAddingToCategory(null);
    toast.success('Added.', { duration: 2000 });
  };

  const handleAddCategory = async (name: string) => {
    await onAddCategory(name);
    setShowAddCategory(false);
    toast.success('Added.', { duration: 2000 });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-6 pb-32">
        {/* MomentArc */}
        <div className="mb-6">
          <MomentArc currentMoment={2} completedMoments={[1]} />
        </div>

        {/* Title + summary */}
        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          Here&rsquo;s what I&rsquo;d suggest for {eventName}.
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {totalItems} {totalItems === 1 ? 'item' : 'items'} across {categories.length}{' '}
          {categories.length === 1 ? 'category' : 'categories'}, based on {guestCount}{' '}
          {guestCount === 1 ? 'guest' : 'guests'}.
        </p>
        <button
          type="button"
          onClick={onRegeneratePlan}
          disabled={regeneratingScope !== null}
          className="-mt-4 mb-6 text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
        >
          {regeneratingScope === 'plan'
            ? 'Regenerating the plan…'
            : 'Not quite right? Regenerate the plan'}
        </button>

        {/* Category sections */}
        <div className="space-y-6">
          {categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              isCollapsed={collapsed.has(category.id)}
              onToggleCollapsed={() => toggleCollapsed(category.id)}
              editingItemId={editingItemId}
              quantityEditId={quantityEditId}
              isAddingItem={addingToCategory === category.id}
              onStartEdit={(id) => {
                setQuantityEditId(null);
                setEditingItemId(id);
              }}
              onCancelEdit={() => setEditingItemId(null)}
              onSaveEdit={handleSaveEdit}
              onRemoveItem={handleRemove}
              onStartQuantityEdit={(id) => {
                setEditingItemId(null);
                setQuantityEditId(id);
              }}
              onCancelQuantityEdit={() => setQuantityEditId(null)}
              onSaveQuantity={handleQuantitySave}
              onStartAddItem={() => {
                setAddingToCategory(category.id);
                setEditingItemId(null);
              }}
              onCancelAddItem={() => setAddingToCategory(null)}
              onAddItem={handleAdd}
              selectedItemIds={selectedItemIds}
              onToggleSelection={toggleSelection}
              categoryKey={LABEL_TO_KEY[category.name] ?? null}
              regeneratingScope={regeneratingScope}
              onRegenerateCategory={onRegenerateCategory}
            />
          ))}
        </div>

        {/* Add category */}
        <div className="mt-8">
          {showAddCategory ? (
            <AddCategoryForm onAdd={handleAddCategory} onCancel={() => setShowAddCategory(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddCategory(true)}
              className="w-full text-sm text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 rounded-lg py-3 px-4 hover:border-gray-400 transition-colors"
            >
              + Add category
            </button>
          )}
        </div>
      </div>

      {/* Floating bulk-action button */}
      {selectedItemIds.size > 0 && (
        <button
          type="button"
          onClick={handleBulkRemove}
          disabled={bulkRemoving}
          aria-label={`Remove ${selectedItemIds.size} selected ${selectedItemIds.size === 1 ? 'item' : 'items'}`}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-full pl-4 pr-5 py-2.5 shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Delete {selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'items'} now
        </button>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={regeneratingScope !== null}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back to event setup
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={regeneratingScope !== null}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Plan looks good →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category section ────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: PlanCategory;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  editingItemId: string | null;
  quantityEditId: string | null;
  isAddingItem: boolean;
  onStartEdit: (itemId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (itemId: string, updates: Partial<PlanItem>) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onStartQuantityEdit: (itemId: string) => void;
  onCancelQuantityEdit: () => void;
  onSaveQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  onStartAddItem: () => void;
  onCancelAddItem: () => void;
  onAddItem: (categoryId: string, item: NewPlanItem) => Promise<void>;
  selectedItemIds: Set<string>;
  onToggleSelection: (itemId: string) => void;
  categoryKey: string | null;
  regeneratingScope: 'plan' | string | null;
  onRegenerateCategory: (categoryKey: string) => void;
}

function CategorySection({
  category,
  isCollapsed,
  onToggleCollapsed,
  editingItemId,
  quantityEditId,
  isAddingItem,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemoveItem,
  onStartQuantityEdit,
  onCancelQuantityEdit,
  onSaveQuantity,
  onStartAddItem,
  onCancelAddItem,
  onAddItem,
  selectedItemIds,
  onToggleSelection,
  categoryKey,
  regeneratingScope,
  onRegenerateCategory,
}: CategorySectionProps) {
  const itemCount = category.items.length;
  const isRegenerating =
    regeneratingScope === 'plan' || (categoryKey !== null && regeneratingScope === categoryKey);

  return (
    <div className={isRegenerating ? 'animate-pulse opacity-60 pointer-events-none' : undefined}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
      >
        <h2 className="text-base font-medium text-gray-900">
          <span className="mr-2">{category.emoji}</span>
          {category.name}
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
        </div>
      </button>

      {!isCollapsed && (
        <div className="mt-3 space-y-1">
          {category.items.length === 0 && !isAddingItem && (
            <p className="text-sm text-gray-400 italic py-2">No items yet.</p>
          )}

          {category.items.map((item) => (
            <div key={item.id}>
              <ItemRow
                item={item}
                isEditing={editingItemId === item.id}
                isEditingQuantity={quantityEditId === item.id}
                isSelected={selectedItemIds.has(item.id)}
                onToggleSelection={() => onToggleSelection(item.id)}
                onOpenEdit={() => onStartEdit(item.id)}
                onOpenQuantityEdit={() => onStartQuantityEdit(item.id)}
                onCancelQuantityEdit={onCancelQuantityEdit}
                onSaveQuantity={(q) => onSaveQuantity(item.id, q)}
                onRemove={() => onRemoveItem(item.id)}
              />
              {editingItemId === item.id && (
                <ItemEditForm
                  item={item}
                  onSave={(updates) => onSaveEdit(item.id, updates)}
                  onCancel={onCancelEdit}
                  onRemove={() => onRemoveItem(item.id)}
                />
              )}
            </div>
          ))}

          <div className="pt-2">
            {isAddingItem ? (
              <AddItemForm
                onAdd={(item) => onAddItem(category.id, item)}
                onCancel={onCancelAddItem}
              />
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onStartAddItem}
                  className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                >
                  + Add item
                </button>
                {categoryKey !== null && (
                  <button
                    type="button"
                    onClick={() => onRegenerateCategory(categoryKey)}
                    disabled={regeneratingScope !== null}
                    className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {regeneratingScope === categoryKey
                      ? 'Regenerating…'
                      : '↻ Regenerate this category'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Item row ────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: PlanItem;
  isEditing: boolean;
  isEditingQuantity: boolean;
  isSelected: boolean;
  onToggleSelection: () => void;
  onOpenEdit: () => void;
  onOpenQuantityEdit: () => void;
  onCancelQuantityEdit: () => void;
  onSaveQuantity: (quantity: number) => Promise<void>;
  onRemove: () => Promise<void>;
}

function ItemRow({
  item,
  isEditing,
  isEditingQuantity,
  isSelected,
  onToggleSelection,
  onOpenEdit,
  onOpenQuantityEdit,
  onCancelQuantityEdit,
  onSaveQuantity,
  onRemove,
}: ItemRowProps) {
  const rowBg = isEditing ? 'bg-gray-100' : 'hover:bg-gray-50';
  const markedStrike = isSelected ? 'line-through text-gray-400' : '';

  return (
    <div className={`flex items-center gap-2 py-2 px-2 rounded ${rowBg}`}>
      {/* Name + serving size (stacked) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <button
          type="button"
          onClick={onOpenEdit}
          className={`text-left text-sm text-gray-800 hover:text-gray-900 break-words ${markedStrike}`}
        >
          {item.name}
        </button>
        {item.servingSize && (
          <span className={`text-xs text-gray-500 break-words ${markedStrike}`}>
            {item.servingSize}
          </span>
        )}
      </div>

      {/* Quantity (tap-to-edit) */}
      {isEditingQuantity ? (
        <InlineQuantityEdit
          initialQuantity={item.quantity}
          unit={item.unit}
          onSave={onSaveQuantity}
          onCancel={onCancelQuantityEdit}
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenQuantityEdit();
          }}
          className={`text-sm text-gray-600 whitespace-nowrap px-2 py-1 rounded hover:bg-gray-200 transition-colors ${markedStrike}`}
          aria-label="Edit quantity"
        >
          {item.quantity} {item.unit}
        </button>
      )}

      {/* Per-row Edit */}
      <button
        type="button"
        onClick={onOpenEdit}
        className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
      >
        Edit
      </button>

      {/* Per-row Quick delete */}
      <button
        type="button"
        onClick={onRemove}
        className={`text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors ${markedStrike}`}
      >
        Quick delete
      </button>

      {/* Per-row Mark for delete (toggles strikethrough + bulk selection) */}
      <button
        type="button"
        onClick={onToggleSelection}
        aria-pressed={isSelected}
        className={`text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors ${markedStrike}`}
      >
        Mark for delete
      </button>
    </div>
  );
}

// ─── Inline quantity edit ────────────────────────────────────────────────────

interface InlineQuantityEditProps {
  initialQuantity: number;
  unit: string;
  onSave: (quantity: number) => Promise<void>;
  onCancel: () => void;
}

function InlineQuantityEdit({ initialQuantity, unit, onSave, onCancel }: InlineQuantityEditProps) {
  const [value, setValue] = useState(String(initialQuantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = async () => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      onCancel();
      return;
    }
    if (parsed === initialQuantity) {
      onCancel();
      return;
    }
    await onSave(parsed);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-20 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <span className="text-sm text-gray-500 whitespace-nowrap">{unit}</span>
    </div>
  );
}

// ─── Item edit form ──────────────────────────────────────────────────────────

interface ItemEditFormProps {
  item: PlanItem;
  onSave: (updates: Partial<PlanItem>) => Promise<void>;
  onCancel: () => void;
  onRemove: () => Promise<void>;
}

function ItemEditForm({ item, onSave, onCancel, onRemove }: ItemEditFormProps) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [serves, setServes] = useState(item.servingSize);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSave = async () => {
    const parsedQuantity = parseFloat(quantity);
    if (!name.trim() || Number.isNaN(parsedQuantity)) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        quantity: parsedQuantity,
        unit: unit.trim(),
        servingSize: serves.trim(),
        notes: notes.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="ml-8 mr-2 mb-2 mt-1 border border-gray-200 rounded-lg bg-white p-3 space-y-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <FormField label="Name">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <FormField label="Quantity">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-24 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <UnitSelector value={unit} onChange={setUnit} />
        </div>
      </FormField>

      <FormField label="Serves">
        <input
          type="text"
          value={serves}
          onChange={(e) => setServes(e.target.value)}
          placeholder="feeds 12"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <FormField label="Notes">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="text-sm px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-dark disabled:opacity-50 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-sm px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={saving}
          className="text-sm px-3 py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Add item form ───────────────────────────────────────────────────────────

interface AddItemFormProps {
  onAdd: (item: NewPlanItem) => Promise<void>;
  onCancel: () => void;
}

function AddItemForm({ onAdd, onCancel }: AddItemFormProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pieces');
  const [serves, setServes] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleAdd = async () => {
    if (!name.trim()) return;
    const parsedQuantity = parseFloat(quantity);
    if (Number.isNaN(parsedQuantity)) return;
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(),
        quantity: parsedQuantity,
        unit: unit.trim() || 'pieces',
        servingSize: serves.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="ml-2 mr-2 mb-2 border border-gray-200 rounded-lg bg-white p-3 space-y-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <FormField label="Name">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <FormField label="Quantity">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-24 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <UnitSelector value={unit} onChange={setUnit} />
        </div>
      </FormField>

      <FormField label="Serves">
        <input
          type="text"
          value={serves}
          onChange={(e) => setServes(e.target.value)}
          placeholder="Optional"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          className="text-sm px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-dark disabled:opacity-50 transition-colors"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Add category form ───────────────────────────────────────────────────────

interface AddCategoryFormProps {
  onAdd: (name: string) => Promise<void>;
  onCancel: () => void;
}

function AddCategoryForm({ onAdd, onCancel }: AddCategoryFormProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="border border-gray-200 rounded-lg bg-white p-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <FormField label="Category name">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="e.g. Snacks"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>
      <div className="flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          className="text-sm px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-dark disabled:opacity-50 transition-colors"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Shared form helpers ─────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

interface UnitSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

function UnitSelector({ value, onChange }: UnitSelectorProps) {
  const isCommon = COMMON_UNITS.includes(value);
  const [mode, setMode] = useState<'select' | 'custom'>(isCommon || !value ? 'select' : 'custom');

  if (mode === 'custom') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="custom"
          className="w-24 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => {
            onChange(COMMON_UNITS[0]);
            setMode('select');
          }}
          className="text-xs text-gray-500 hover:text-gray-700 px-1"
          aria-label="Use preset unit"
        >
          ▼
        </button>
      </div>
    );
  }

  return (
    <select
      value={COMMON_UNITS.includes(value) ? value : COMMON_UNITS[0]}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          setMode('custom');
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {COMMON_UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
      <option value="__custom__">Custom…</option>
    </select>
  );
}
