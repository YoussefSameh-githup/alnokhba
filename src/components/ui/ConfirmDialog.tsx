"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./Modal";

export type ConfirmRequest = { title: string; description: string; confirmLabel: string; onConfirm: () => Promise<void> | void };

/** Destructive-action confirmation. Render once per page and drive it with a ConfirmRequest. */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={Boolean(request)}
      onClose={() => !busy && onClose()}
      size="sm"
      title={request?.title ?? ""}
      icon={<AlertTriangle className="h-4 w-4" />}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>تراجع</button>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              if (!request) return;
              setBusy(true);
              try {
                await request.onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {request?.confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{request?.description}</p>
    </Modal>
  );
}
