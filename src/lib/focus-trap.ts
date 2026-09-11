"use client";

/* v0.27.0 — focus-trap primitives for dialogs (user-review A11Y-1/2/3).
 *
 * A tiny dependency-free implementation: while a dialog is open, Tab /
 * Shift+Tab cycle INSIDE the container, the initial focus goes to a sensible
 * element (primary control or the first focusable), and closing restores
 * focus to the element that opened the dialog.
 *
 * Usage:
 *   const ref = useFocusTrap<HTMLDivElement>(open, { onClose });
 *   <div ref={ref} role="dialog" aria-modal="true"> … </div>
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(active: boolean, opts?: { onClose?: () => void; initialFocus?: () => HTMLElement | null }) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const opener = document.activeElement as HTMLElement | null;

    // initial focus: explicit target → first focusable → the container itself
    const focusInitial = () => {
      const explicit = opts?.initialFocus?.();
      const target = explicit ?? (node?.querySelector<HTMLElement>(FOCUSABLE) ?? node);
      try {
        target?.focus();
      } catch {
        /* ignore */
      }
    };
    const raf = requestAnimationFrame(focusInitial);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && opts?.onClose) {
        e.stopPropagation();
        opts.onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (activeEl === first || !node.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || !node.contains(activeEl))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      // restore focus to the opener so keyboard users don't fall off <body>
      if (opener && document.contains(opener)) {
        try {
          opener.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [active]);

  return ref;
}
