"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

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
    // Native modal semantics keep background controls inert.
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      // Responsive layouts can keep the trigger mounted while hiding it at another breakpoint.
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus.getClientRects().length > 0
      ) {
        previousFocus.focus();
      } else {
        fallbackFocus?.focus();
      }
    };
  }, [returnFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]",
      ),
    ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    // Native inertness prevents background focus; explicitly wrap the endpoints as well.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

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
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
