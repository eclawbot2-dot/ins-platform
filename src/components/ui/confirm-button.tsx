"use client";

import type { ReactNode } from "react";

/**
 * Submit button for destructive server-action forms — asks for
 * confirmation before letting the form submit.
 */
export function ConfirmButton({
  children,
  message = "Are you sure? This cannot be undone.",
  className = "btn btn-sm",
}: {
  children: ReactNode;
  message?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
