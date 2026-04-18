'use client';

import { useEffect, useRef, useState } from 'react';
import MomentArc from './MomentArc';
import { useToast } from '@/contexts/ToastContext';

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
  onReorderItem: (itemId: string, newIndex: number) => Promise<void>;
  onApprove: () => void;
  onBack: () => void;
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
  onReorderItem,
  onApprove,
  onBack,
}: Moment2PlanViewProps) {
  const toast = useToast();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [quantityEditId, setQuantityEditId] = useState<string | null>(null);
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

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
    toast.success('Updated.');
  };

  const handleRemove = async (itemId: string) => {
    await onRemoveItem(itemId);
    setEditingItemId(null);
    toast.success('Removed.');
  };

  const handleQuantitySave = async (itemId: string, newQuantity: number) => {
    await onUpdateItem(itemId, { quantity: newQuantity });
    setQuantityEditId(null);
    toast.success('Updated.');
  };

  const handleAdd = async (categoryId: string, item: NewPlanItem) => {
    await onAddItem(categoryId, item);
    setAddingToCategory(null);
    toast.success('Added.');
  };

  const handleAddCategory = async (name: string) => {
    await onAddCategory(name);
    setShowAddCategory(false);
    toast.success('Added.');
  };

  const handleMoveItem = async (categoryId: string, itemId: string, direction: 'up' | 'down') => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    const currentIndex = category.items.findIndex((i) => i.id === itemId);
    if (currentIndex < 0) return;
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= category.items.length) return;
    await onReorderItem(itemId, newIndex);
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
              onMoveItem={handleMoveItem}
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

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
          >
            ← Back to event setup
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors"
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
  onMoveItem: (categoryId: string, itemId: string, direction: 'up' | 'down') => Promise<void>;
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
  onMoveItem,
}: CategorySectionProps) {
  const itemCount = category.items.length;

  return (
    <div>
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

          {category.items.map((item, index) => (
            <div key={item.id}>
              <ItemRow
                item={item}
                isFirst={index === 0}
                isLast={index === category.items.length - 1}
                isEditing={editingItemId === item.id}
                isEditingQuantity={quantityEditId === item.id}
                onOpenEdit={() => onStartEdit(item.id)}
                onOpenQuantityEdit={() => onStartQuantityEdit(item.id)}
                onCancelQuantityEdit={onCancelQuantityEdit}
                onSaveQuantity={(q) => onSaveQuantity(item.id, q)}
                onMoveUp={() => onMoveItem(category.id, item.id, 'up')}
                onMoveDown={() => onMoveItem(category.id, item.id, 'down')}
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
              <button
                type="button"
                onClick={onStartAddItem}
                className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                + Add item
              </button>
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
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  isEditingQuantity: boolean;
  onOpenEdit: () => void;
  onOpenQuantityEdit: () => void;
  onCancelQuantityEdit: () => void;
  onSaveQuantity: (quantity: number) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ItemRow({
  item,
  isFirst,
  isLast,
  isEditing,
  isEditingQuantity,
  onOpenEdit,
  onOpenQuantityEdit,
  onCancelQuantityEdit,
  onSaveQuantity,
  onMoveUp,
  onMoveDown,
}: ItemRowProps) {
  return (
    <div
      className={`flex items-center gap-2 py-2 px-2 rounded group ${
        isEditing ? 'bg-gray-100' : 'hover:bg-gray-50'
      }`}
    >
      {/* Reorder arrows */}
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          disabled={isFirst}
          aria-label="Move item up"
          className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          disabled={isLast}
          aria-label="Move item down"
          className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
        >
          ▼
        </button>
      </div>

      {/* Clickable name (opens full edit) */}
      <button
        type="button"
        onClick={onOpenEdit}
        className="flex-1 text-left text-sm text-gray-800 hover:text-gray-900"
      >
        {item.name}
      </button>

      {/* Serving size */}
      <span className="text-sm text-gray-500 whitespace-nowrap hidden sm:inline">
        {item.servingSize}
      </span>

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
          className="text-sm text-gray-600 whitespace-nowrap px-2 py-1 rounded hover:bg-gray-200 transition-colors"
          aria-label="Edit quantity"
        >
          {item.quantity} {item.unit}
        </button>
      )}
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
