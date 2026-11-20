import { createPortal } from "react-dom";

import { MODAL_SIZES } from "./constants";

import type { ReactNode } from "react";

interface EditorModalProps {
  /** The heading, with its icon. */
  title: ReactNode;
  /** "small" for a confirmation, "large" for the prompt and import dialogs. */
  size: "small" | "large";
  /** Shows a ✕ in the heading that calls it. */
  onClose?: () => void;
  children: ReactNode;
  /** Buttons in a bar below the body. */
  footer?: ReactNode;
}

/** The schema editor's dialogs: a panel over the page, put on document.body. */
export function EditorModal({ title, size, onClose, children, footer }: EditorModalProps) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-surface rounded-2xl w-full ${MODAL_SIZES[size]} shadow-2xl overflow-hidden`}>
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">{title}</h3>
          {onClose && (
            <button type="button" onClick={onClose} className="text-ink-muted hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              ✕
            </button>
          )}
        </div>
        {children}
        {footer && <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface-raised">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
