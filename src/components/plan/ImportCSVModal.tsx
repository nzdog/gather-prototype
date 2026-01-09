'use client';

import { useState, useRef } from 'react';
import { X, Upload, CheckCircle, AlertTriangle, ChevronRight, Download } from 'lucide-react';

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (people: PersonRow[]) => Promise<void>;
  teams: { id: string; name: string }[];
}

export interface PersonRow {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  teamId?: string | null;
}

interface ParsedRow extends PersonRow {
  _rowIndex: number;
  _selected: boolean;
  _validationErrors: string[];
  _validationWarnings: string[];
  _isDuplicate?: boolean;
}

type FieldMapping = {
  csvColumn: string;
  targetField: 'name' | 'email' | 'phone' | 'ignore';
};

const TARGET_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'ignore', label: 'Ignore' },
] as const;

export default function ImportCSVModal({ isOpen, onClose, onImport, teams }: ImportCSVModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [parsedPeople, setParsedPeople] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [splitFullName, setSplitFullName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModal = () => {
    setStep(1);
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setMappings([]);
    setParsedPeople([]);
    setImporting(false);
    setSplitFullName(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  // Step 1: Parse CSV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length === 0) {
      alert('CSV file is empty');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
      return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    });

    setCsvHeaders(headers);
    setCsvRows(rows);

    // Generate smart mappings
    const smartMappings = headers.map((header): FieldMapping => {
      const lowerHeader = header.toLowerCase();

      // Smart suggestions based on common column names
      if (lowerHeader.includes('name') && !lowerHeader.includes('first') && !lowerHeader.includes('last')) {
        return { csvColumn: header, targetField: 'name' };
      }
      if (lowerHeader.includes('first') || lowerHeader === 'fname') {
        return { csvColumn: header, targetField: 'name' };
      }
      if (lowerHeader.includes('email') || lowerHeader.includes('e-mail') || lowerHeader === 'mail') {
        return { csvColumn: header, targetField: 'email' };
      }
      if (lowerHeader.includes('phone') || lowerHeader.includes('mobile') || lowerHeader.includes('tel')) {
        return { csvColumn: header, targetField: 'phone' };
      }

      return { csvColumn: header, targetField: 'ignore' };
    });

    setMappings(smartMappings);
    setStep(2);
  };

  // Step 2: Handle mapping changes
  const handleMappingChange = (csvColumn: string, targetField: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.csvColumn === csvColumn
          ? { ...m, targetField: targetField as 'name' | 'email' | 'phone' | 'ignore' }
          : m
      )
    );
  };

  const handleProceedToReview = () => {
    // Check if at least one field is mapped to 'name'
    const hasNameMapping = mappings.some((m) => m.targetField === 'name');
    if (!hasNameMapping) {
      alert('You must map at least one column to "Name"');
      return;
    }

    // Parse rows into people
    const people: ParsedRow[] = csvRows.map((row, index) => {
      const person: any = {
        _rowIndex: index + 2, // +2 because row 1 is headers, and we're 0-indexed
        _selected: true,
        _validationErrors: [],
        _validationWarnings: [],
      };

      // Build person from mappings
      let nameFields: string[] = [];

      mappings.forEach((mapping, colIndex) => {
        const value = row[colIndex]?.trim() || '';

        if (mapping.targetField === 'name' && value) {
          nameFields.push(value);
        } else if (mapping.targetField === 'email') {
          person.email = value || null;
        } else if (mapping.targetField === 'phone') {
          person.phone = value || null;
        }
      });

      // Combine name fields
      person.name = nameFields.join(' ').trim();

      // Normalize
      if (person.email) {
        person.email = person.email.toLowerCase();
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) {
          person._validationWarnings.push('Invalid email format');
        }
      }

      if (person.phone) {
        // Store original formatting but strip for comparison
        person.phone = person.phone.replace(/[\s\-()]/g, '');
      }

      // Validation
      if (!person.name) {
        person._validationErrors.push('Missing name');
        person._selected = false; // Auto-deselect invalid rows
      }

      return person as ParsedRow;
    });

    // Duplicate detection
    const emailMap = new Map<string, number[]>();
    const namePhoneMap = new Map<string, number[]>();

    people.forEach((person, index) => {
      // Email duplicates (strong signal)
      if (person.email) {
        const existing = emailMap.get(person.email) || [];
        existing.push(index);
        emailMap.set(person.email, existing);
      }

      // Name+phone duplicates (medium signal)
      if (person.name && person.phone) {
        const key = `${person.name.toLowerCase()}:${person.phone}`;
        const existing = namePhoneMap.get(key) || [];
        existing.push(index);
        namePhoneMap.set(key, existing);
      }
    });

    // Mark duplicates
    emailMap.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => {
          people[i]._isDuplicate = true;
          people[i]._validationWarnings.push(`Duplicate email (rows: ${indices.map((idx) => people[idx]._rowIndex).join(', ')})`);
        });
      }
    });

    namePhoneMap.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => {
          if (!people[i]._isDuplicate) {
            people[i]._isDuplicate = true;
            people[i]._validationWarnings.push(`Duplicate name+phone (rows: ${indices.map((idx) => people[idx]._rowIndex).join(', ')})`);
          }
        });
      }
    });

    setParsedPeople(people);
    setStep(3);
  };

  // Step 3: Selection and import
  const toggleSelection = (index: number) => {
    setParsedPeople((prev) =>
      prev.map((p, i) => (i === index ? { ...p, _selected: !p._selected } : p))
    );
  };

  const toggleSelectAll = () => {
    const validPeople = parsedPeople.filter((p) => p._validationErrors.length === 0);
    const allValidSelected = validPeople.every((p) => p._selected);

    setParsedPeople((prev) =>
      prev.map((p) =>
        p._validationErrors.length === 0
          ? { ...p, _selected: !allValidSelected }
          : p
      )
    );
  };

  const handleImport = async () => {
    const selectedPeople = parsedPeople
      .filter((p) => p._selected)
      .map((p) => ({
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: 'PARTICIPANT',
      }));

    if (selectedPeople.length === 0) {
      alert('No people selected for import');
      return;
    }

    setImporting(true);
    try {
      await onImport(selectedPeople);
      handleClose();
    } catch (error: any) {
      alert(error.message || 'Failed to import people');
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = () => {
    const errorRows = parsedPeople.filter(
      (p) => p._validationErrors.length > 0 || p._validationWarnings.length > 0
    );

    const csv = [
      ['Row', 'Name', 'Email', 'Phone', 'Errors', 'Warnings'].join(','),
      ...errorRows.map((p) =>
        [
          p._rowIndex,
          `"${p.name || ''}"`,
          `"${p.email || ''}"`,
          `"${p.phone || ''}"`,
          `"${p._validationErrors.join('; ')}"`,
          `"${p._validationWarnings.join('; ')}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCount = parsedPeople.filter((p) => p._selected).length;
  const errorCount = parsedPeople.filter((p) => p._validationErrors.length > 0).length;
  const warningCount = parsedPeople.filter(
    (p) => p._validationWarnings.length > 0 && p._validationErrors.length === 0
  ).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Import People from CSV</h2>
            <p className="text-sm text-gray-600 mt-1">
              Step {step} of 3:{' '}
              {step === 1 ? 'Upload' : step === 2 ? 'Map Columns' : 'Review & Select'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>CSV Format:</strong> Your CSV should include a header row with column names.
                  At minimum, include names. Email and phone are optional.
                </p>
                <p className="text-sm text-blue-900 mt-2">
                  <strong>Example:</strong> Name, Email, Phone
                </p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
                >
                  Choose CSV File
                </label>
                {csvFile && (
                  <p className="text-sm text-gray-600 mt-2">
                    Selected: {csvFile.name} ({csvHeaders.length} columns, {csvRows.length} rows)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Map Columns */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  Map your CSV columns to Gather fields. We've made smart suggestions based on your
                  column names.
                </p>
              </div>

              <div className="space-y-3">
                {mappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{mapping.csvColumn}</p>
                      <p className="text-xs text-gray-500">
                        Sample: {csvRows[0]?.[index] || '(empty)'}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                    <select
                      value={mapping.targetField}
                      onChange={(e) => handleMappingChange(mapping.csvColumn, e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TARGET_FIELDS.map((field) => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review & Select */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{selectedCount}</span> selected
                  </div>
                  {errorCount > 0 && (
                    <div className="text-sm text-red-600">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      {errorCount} error{errorCount !== 1 ? 's' : ''}
                    </div>
                  )}
                  {warningCount > 0 && (
                    <div className="text-sm text-yellow-600">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      {warningCount} warning{warningCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {(errorCount > 0 || warningCount > 0) && (
                  <button
                    onClick={downloadErrorReport}
                    className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    <Download className="w-4 h-4" />
                    Download Error Report
                  </button>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            parsedPeople.filter((p) => p._validationErrors.length === 0).length > 0 &&
                            parsedPeople
                              .filter((p) => p._validationErrors.length === 0)
                              .every((p) => p._selected)
                          }
                          onChange={toggleSelectAll}
                          className="w-4 h-4"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        Row
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        Phone
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedPeople.map((person, index) => (
                      <tr
                        key={index}
                        className={`${
                          person._validationErrors.length > 0
                            ? 'bg-red-50'
                            : person._isDuplicate
                              ? 'bg-yellow-50'
                              : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={person._selected}
                            onChange={() => toggleSelection(index)}
                            disabled={person._validationErrors.length > 0}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{person._rowIndex}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{person.name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{person.email || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{person.phone || '—'}</td>
                        <td className="px-4 py-3">
                          {person._validationErrors.length > 0 ? (
                            <div className="flex items-center gap-1 text-red-600 text-xs">
                              <AlertTriangle className="w-3 h-3" />
                              {person._validationErrors[0]}
                            </div>
                          ) : person._validationWarnings.length > 0 ? (
                            <div className="flex items-center gap-1 text-yellow-600 text-xs">
                              <AlertTriangle className="w-3 h-3" />
                              {person._validationWarnings[0]}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle className="w-3 h-3" />
                              Valid
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((prev) => (prev - 1) as 1 | 2)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            {step === 2 && (
              <button
                onClick={handleProceedToReview}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Next: Review
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : `Import ${selectedCount} ${selectedCount === 1 ? 'Person' : 'People'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
