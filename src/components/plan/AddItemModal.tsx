'use client';

import { useState } from 'react';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (itemData: ItemFormData) => Promise<void>;
  teamName: string;
}

export interface ItemFormData {
  name: string;
  quantityAmount?: number;
  quantityUnit?: string;
  critical?: boolean;
  dietaryTags?: string[];
  description?: string;
}

const QUANTITY_UNITS = [
  { value: 'SERVINGS', label: 'Servings' },
  { value: 'KG', label: 'Kilograms' },
  { value: 'G', label: 'Grams' },
  { value: 'L', label: 'Liters' },
  { value: 'ML', label: 'Milliliters' },
  { value: 'COUNT', label: 'Count' },
  { value: 'PACKS', label: 'Packs' },
  { value: 'TRAYS', label: 'Trays' },
];

const DIETARY_TAGS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'glutenFree', label: 'Gluten Free' },
  { value: 'dairyFree', label: 'Dairy Free' },
  { value: 'nutFree', label: 'Nut Free' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
];

export default function AddItemModal({ isOpen, onClose, onAdd, teamName }: AddItemModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantityAmount, setQuantityAmount] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('SERVINGS');
  const [critical, setCritical] = useState(false);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  if (!isOpen) return null;

  const handleDietaryTagToggle = (tag: string) => {
    if (dietaryTags.includes(tag)) {
      setDietaryTags(dietaryTags.filter(t => t !== tag));
    } else {
      setDietaryTags([...dietaryTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Please enter item name');
      return;
    }

    setAdding(true);
    try {
      const itemData: ItemFormData = {
        name: name.trim(),
        description: description.trim() || undefined,
        critical,
        dietaryTags: dietaryTags.length > 0 ? dietaryTags : undefined
      };

      // Add quantity if specified
      if (quantityAmount && parseFloat(quantityAmount) > 0) {
        itemData.quantityAmount = parseFloat(quantityAmount);
        itemData.quantityUnit = quantityUnit;
      }

      await onAdd(itemData);

      // Reset form
      setName('');
      setDescription('');
      setQuantityAmount('');
      setQuantityUnit('SERVINGS');
      setCritical(false);
      setDietaryTags([]);
      onClose();
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Failed to add item. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    if (!adding) {
      setName('');
      setDescription('');
      setQuantityAmount('');
      setQuantityUnit('SERVINGS');
      setCritical(false);
      setDietaryTags([]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 my-8">
        <h2 className="text-xl font-bold mb-2">Add Item to {teamName}</h2>
        <p className="text-sm text-gray-600 mb-4">
          Add a new item to this team's responsibility
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 mb-6">
            {/* Item Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Christmas Pudding"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                disabled={adding}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Traditional pudding with brandy butter"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={adding}
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={quantityAmount}
                  onChange={(e) => setQuantityAmount(e.target.value)}
                  placeholder="Amount"
                  step="0.1"
                  min="0"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                />
                <select
                  value={quantityUnit}
                  onChange={(e) => setQuantityUnit(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                >
                  {QUANTITY_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Critical Flag */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={critical}
                  onChange={(e) => setCritical(e.target.checked)}
                  className="w-4 h-4 text-blue-600"
                  disabled={adding}
                />
                <span className="text-sm font-medium text-gray-700">
                  Mark as Critical
                </span>
              </label>
              <p className="text-xs text-gray-500 ml-6 mt-1">
                Critical items must be assigned before event can be frozen
              </p>
            </div>

            {/* Dietary Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dietary Tags (Optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAGS.map((tag) => (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => handleDietaryTagToggle(tag.value)}
                    disabled={adding}
                    className={`px-3 py-1 text-xs rounded-full border transition ${
                      dietaryTags.includes(tag.value)
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                    } disabled:opacity-50`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={adding}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !name.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
