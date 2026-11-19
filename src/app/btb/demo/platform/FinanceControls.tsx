"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { Button, Input } from "@/components/ui";
import { useBtbCommand } from "@/components/btb/useBtbCommand";
import { financeProblem, type FinanceAction } from "@/lib/btb-finance";

export function useFinanceCommand(locationId: string, reload: () => void) {
  const command = useBtbCommand("/api/btb/platform/finance", reload);
  const [validation, setValidation] = useState("");
  const act = async (action: FinanceAction, data: Record<string, unknown>, success = "Finance record saved.") => {
    const problem = financeProblem(action, data);
    setValidation(problem ?? "");
    if (problem) return false;
    return command.run({ location_id: locationId, action, data }, success);
  };
  return { ...command, error: validation || command.error, act };
}
export type FinanceCommand = ReturnType<typeof useFinanceCommand>;
export function CommandFeedback({ command }: { command: { error: string; notice: string } }) {
  return <>{command.error && <p className="ui-notice ui-notice--error" role="alert">{command.error}</p>}{command.notice && <p className="ui-notice ui-notice--success" role="status">{command.notice}</p>}</>;
}
export function ReasonForm({ title, description, action, data, command, onClose }: {
  title: string; description: string; action: FinanceAction; data: Record<string, unknown>;
  command: FinanceCommand; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return <Modal open title={title} description={description} busy={command.busy} onClose={onClose}>
    <form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if (await command.act(action, { ...data, reason: reason.trim() }, `${title}: correction recorded.`)) onClose(); }}>
      <label>Correction reason<Input data-modal-autofocus required maxLength={2000} value={reason} disabled={command.busy} onChange={(event) => setReason(event.target.value)} /></label>
      <CommandFeedback command={command} />
      <div className="ui-modal__actions"><Button variant="ghost" disabled={command.busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" disabled={command.busy || !reason.trim()}>{command.busy ? "Saving…" : title}</Button></div>
    </form>
  </Modal>;
}
export function downloadCsv(source: string, name: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
export const unitMoney = (value: number | null) => value === null ? "Missing" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
