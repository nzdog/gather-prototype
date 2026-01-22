'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SectionExpandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function restoreScrollPosition(): void {
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, parseInt(scrollY || '0') * -1);
}

export default function SectionExpandModal({
  isOpen,
  onClose,
  title,
  icon,
  children,
}: SectionExpandModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return restoreScrollPosition;
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement) return;

    function handleTabKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return;

      const atFirst = document.activeElement === firstElement;
      const atLast = document.activeElement === lastElement;

      if (e.shiftKey && atFirst) {
        lastElement?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && atLast) {
        firstElement?.focus();
        e.preventDefault();
      }
    }

    modal.addEventListener('keydown', handleTabKey);
    firstElement.focus();

    return () => modal.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  function handleBackdropClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-modal-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white rounded-t-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            {icon && <div className="text-gray-600">{icon}</div>}
            <h2 id="section-modal-title" className="text-2xl font-bold text-gray-900">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close expanded view"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
