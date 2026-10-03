"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

type ModalProps = {
  children: ReactNode;
  describedBy: string;
  dismissDisabled?: boolean;
  labelledBy: string;
  onDismiss: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function Modal({
  children,
  describedBy,
  dismissDisabled = false,
  labelledBy,
  onDismiss,
  returnFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const fallbackFocus = returnFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Native modal semantics keep background controls inert and trap keyboard focus.
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      } else {
        fallbackFocus?.focus();
      }
    };
  }, [returnFocusRef]);

  return (
    <dialog
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border-strong bg-surface-elevated p-0 text-foreground shadow-panel backdrop:bg-canvas/75"
      onCancel={(event) => {
        event.preventDefault();
        if (!dismissDisabled) onDismiss();
      }}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
