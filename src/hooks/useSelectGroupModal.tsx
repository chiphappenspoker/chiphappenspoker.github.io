'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

interface SelectGroupModalContextValue {
  openSelectGroupModal: boolean;
  setOpenSelectGroupModal: (open: boolean) => void;
  /** Register a callback to run when user selects a group (not "No group" or close). Cleared when modal closes. */
  setGroupSelectedCallback: (cb: (() => void) | null) => void;
  /** Called by SelectGroupModal when user selected a group; runs the registered callback. */
  notifyGroupSelected: () => void;
  /** Clear the callback (e.g. when modal closes). */
  clearGroupSelectedCallback: () => void;
}

const SelectGroupModalContext = createContext<SelectGroupModalContextValue | undefined>(undefined);

export function SelectGroupModalProvider({ children }: { children: ReactNode }) {
  const [openSelectGroupModal, setOpenSelectGroupModal] = useState(false);
  const setter = useCallback((open: boolean) => setOpenSelectGroupModal(open), []);
  const groupSelectedRef = useRef<(() => void) | null>(null);
  const setGroupSelectedCallback = useCallback((cb: (() => void) | null) => {
    groupSelectedRef.current = cb;
  }, []);
  const notifyGroupSelected = useCallback(() => {
    groupSelectedRef.current?.();
  }, []);
  const clearGroupSelectedCallback = useCallback(() => {
    groupSelectedRef.current = null;
  }, []);
  return (
    <SelectGroupModalContext.Provider
      value={{
        openSelectGroupModal,
        setOpenSelectGroupModal: setter,
        setGroupSelectedCallback,
        notifyGroupSelected,
        clearGroupSelectedCallback,
      }}
    >
      {children}
    </SelectGroupModalContext.Provider>
  );
}

export function useSelectGroupModal(): SelectGroupModalContextValue {
  const ctx = useContext(SelectGroupModalContext);
  if (ctx === undefined) throw new Error('useSelectGroupModal must be used within SelectGroupModalProvider');
  return ctx;
}
