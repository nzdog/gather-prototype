'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextValue {
  activeModal: string | null;
  openModal: (id: string) => boolean;
  closeModal: () => void;
  isExpanded: boolean;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const openModal = (id: string): boolean => {
    // Check if an expansion modal is currently open
    if (activeModal?.startsWith('expand-')) {
      alert('Please close the expanded section before opening this dialog.');
      return false;
    }
    setActiveModal(id);
    return true;
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const isExpanded = activeModal?.startsWith('expand-') ?? false;

  return (
    <ModalContext.Provider value={{ activeModal, openModal, closeModal, isExpanded }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
}
