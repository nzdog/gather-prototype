'use client';

import { useState, useEffect } from 'react';
import { StructureTemplate } from '@prisma/client';

interface CloneTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (eventId: string) => void;
  templateId: string;
  hostId: string;
}

interface QuantitiesProfile {
  id: string;
  occasionType: string;
  ratios: any;
  itemQuantities: any[];
  derivedFrom: any;
}

export default function CloneTemplateModal({
  isOpen,
  onClose,
  onClone,
  templateId,
  hostId,
}: CloneTemplateModalProps) {
  const [template, setTemplate] = useState<StructureTemplate | null>(null);
  // TODO: QuantitiesProfile feature (Section 3.11 of build spec) - for quantity scaling across templates
  const [_quantitiesProfile, _setQuantitiesProfile] = useState<QuantitiesProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState(false);

  // Form state
  const [eventName, setEventName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [applyQuantityScaling, setApplyQuantityScaling] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplateDetails();
    }
  }, [isOpen, templateId]);

  const fetchTemplateDetails = async () => {
    try {
      // Fetch template
      const templateResponse = await fetch(`/api/templates/${templateId}?hostId=${hostId}`);
      const templateData = await templateResponse.json();
      setTemplate(templateData.template);

      // Set default event name
      setEventName(templateData.template.name);

      // Check if quantities profile exists for this occasion type
      // Note: This would require a new endpoint or modifying the template endpoint
      // For now, we'll skip this and rely on the clone endpoint to handle it

      setLoading(false);
    } catch (error) {
      console.error('Error fetching template details:', error);
      setLoading(false);
    }
  };

  const handleClone = async () => {
    if (!eventName.trim() || !startDate || !endDate) {
      alert('Please fill in all required fields');
      return;
    }

    if (!guestCount && applyQuantityScaling) {
      alert('Please enter a guest count to apply quantity scaling');
      return;
    }

    setCloning(true);
    try {
      const response = await fetch(`/api/templates/${templateId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId,
          eventName,
          startDate,
          endDate,
          guestCount: guestCount ? parseInt(guestCount) : null,
          applyQuantityScaling,
          occasionType: template?.occasionType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onClone(data.eventId);
        resetForm();
        onClose();
      } else {
        const error = await response.json();
        alert(`Error cloning template: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error cloning template:', error);
      alert('Error cloning template. Please try again.');
    } finally {
      setCloning(false);
    }
  };

  const resetForm = () => {
    setEventName('');
    setStartDate('');
    setEndDate('');
    setGuestCount('');
    setApplyQuantityScaling(false);
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <p className="text-center text-gray-600">Loading template...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return null;
  }

  const teamsData = template.teams as any[];
  const totalItems = teamsData.reduce((sum, team) => sum + (team.items?.length || 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8">
        <h2 className="text-xl font-bold mb-4">Clone Template: {template.name}</h2>

        {/* Template Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
          <h3 className="font-medium mb-2">Template Structure</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Teams:</span> {teamsData.length}
            </div>
            <div>
              <span className="text-gray-600">Items:</span> {totalItems}
            </div>
            <div>
              <span className="text-gray-600">Occasion:</span> {template.occasionType}
            </div>
          </div>
        </div>

        {/* Event Details Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Event Name *</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Guest Count (optional)
            </label>
            <input
              type="number"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              placeholder="e.g., 30"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Quantity Scaling Option */}
          {guestCount && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={applyQuantityScaling}
                  onChange={(e) => setApplyQuantityScaling(e.target.checked)}
                  className="mt-1"
                />
                <div className="text-sm">
                  <span className="font-medium">Apply quantity scaling</span>
                  <p className="text-gray-600 mt-1">
                    Scale item quantities based on your guest count. This uses your saved quantity
                    profiles if available. Quantities can be adjusted after creation.
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* What Will Be Created */}
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
          <h3 className="font-medium mb-2 text-green-900">What will be created:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
            <li>{teamsData.length} teams with structure and scopes</li>
            <li>{totalItems} items tagged as source: TEMPLATE</li>
            <li>All items will be UNASSIGNED (ready for coordinator assignment)</li>
            {applyQuantityScaling && <li>Quantities scaled for {guestCount} guests</li>}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={cloning}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={cloning || !eventName.trim() || !startDate || !endDate}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
          >
            {cloning ? 'Creating...' : 'Create Event from Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
