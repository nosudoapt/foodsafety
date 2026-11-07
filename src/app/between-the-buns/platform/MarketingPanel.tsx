"use client";

import { useMemo, useState } from "react";
import { Download, MessageSquare, RefreshCw, Send, Sparkles } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import { PROMOTION_STATUS_LABEL, promotionTone, type MarketingData, type Promotion } from "@/lib/btb-platform-marketing";
import { formatDate, formatStamp, nextStep, type Person } from "./marketing-helpers";

export default function MarketingPanel({ locationId, data, person, loading, error, reload }: {
  locationId: string;
  data: MarketingData | null;
  person: Person;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [selected, setSelected] = useState("");
  const [composing, setComposing] = useState(false);

  const promotion = useMemo(() => data?.promotions.find((row) => row.id === selected) ?? null, [data, selected]);

  async function command(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action); setFailure("");
    try {
      await fetchJson("/api/btb/platform/marketing", jsonRequest({ location_id: locationId, action, data: payload }));
      reload();
      return true;
    } catch (cause) {
      setFailure(messageOf(cause));
      return false;
    } finally { setBusy(""); }
  }

  return <>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    {data && <section className="ops-panel" aria-label="Marketing workflow">
      <div className="ops-toolbar">
        <div>
          <h2 className="ops-section-title">Promotion requests</h2>
          <p className="ops-meta">Manager request, corporate approval, designer artwork, then the location calendar. Corporate approval is never optional.</p>
        </div>
        <div className="ops-toolbar-actions">
          <Button variant="ghost" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
          {person.role !== "designer" && <Button variant="soft" onClick={() => setComposing(true)}><Sparkles size={16} aria-hidden="true" />Request a promotion</Button>}
        </div>
      </div>
      <div className="ops-marketing-grid">
        <div>
          {!data.promotions.length && <p className="ui-empty">No promotion requests yet. Managers raise one, corporate approves it, then a designer produces the artwork.</p>}
          <ul className="ui-list">
            {data.promotions.map((row) => <li key={row.id}>
              <button type="button" className={`ops-promotion ${row.id === selected ? "is-active" : ""}`} onClick={() => setSelected(row.id)}>
                <span className="ops-toolbar-actions">
                  <Badge accent={promotionTone(row.workflow_status)}>{PROMOTION_STATUS_LABEL[row.workflow_status] ?? row.workflow_status}</Badge>
                  {row.priority !== "normal" && <Badge accent="amber">{row.priority}</Badge>}
                </span>
                <strong>{row.title}</strong>
                <span className="ops-meta">Promotion {formatDate(row.promotion_start)} to {formatDate(row.promotion_end)} · delivery {formatDate(row.delivery_date)}</span>
              </button>
            </li>)}
          </ul>
        </div>
        <div>
          {promotion
            ? <PromotionDetail
                key={`${promotion.id}:${promotion.version}`}
                promotion={promotion}
                data={data}
                person={person}
                locationId={locationId}
                busy={busy}
                onCommand={command}
              />
            : <p className="ui-empty">Select a request to review its artwork, comments and history.</p>}
        </div>
      </div>
    </section>}

    {composing && <CreateForm
      data={data}
      busy={busy === "create"}
      onClose={() => setComposing(false)}
      onCreate={async (form) => {
        const ok = await command("create", form);
        if (ok) setComposing(false);
      }}
    />}
  </>;
}

function PromotionDetail({ promotion, data, person, locationId, busy, onCommand }: {
  promotion: Promotion;
  data: MarketingData;
  person: Person;
  locationId: string;
  busy: string;
  onCommand: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [designer, setDesigner] = useState(promotion.assigned_to ?? "");
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const assets = data.assets.filter((row) => row.promotion_id === promotion.id);
  const comments = data.comments.filter((row) => row.promotion_id === promotion.id);
  const history = data.history.filter((row) => row.entity_id === promotion.id);
  const step = nextStep(promotion, person);

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const saved = await fetchJson<{ file: { id: string } }>("/api/btb/platform/file", jsonRequest({
        location_id: locationId,
        purpose: "artwork",
        name: file.name,
        mime: file.type || "application/pdf",
        content_base64: Buffer.from(buffer).toString("base64"),
      }));
      await onCommand("upload", { file_id: saved.file.id, version: promotion.version, notes: reason });
      setReason("");
    } finally { setUploading(false); }
  }

  return <Card><div className="ops-panel" aria-label="Promotion detail">
    <h2 className="ops-section-title">{promotion.title}</h2>
    <p className="ops-meta">Raised by {promotion.btb_created_by_name ?? "a manager"} · v{promotion.version} · {promotion.purpose ?? "No purpose recorded"}</p>
    <table className="ui-table">
      <caption>Promotion brief</caption>
      <tbody>
        <tr><th scope="row">Purpose</th><td>{promotion.purpose ?? "Not recorded"}</td></tr>
        <tr><th scope="row">Size</th><td>{promotion.dimensions?.width ? `${promotion.dimensions.width} x ${promotion.dimensions.height} ${promotion.dimensions.unit ?? ""}` : "Not recorded"}</td></tr>
        <tr><th scope="row">Required file</th><td>{promotion.required_file_type?.toUpperCase() ?? "Not recorded"}</td></tr>
        <tr><th scope="row">Delivery</th><td>{formatDate(promotion.delivery_date)}</td></tr>
        <tr><th scope="row">Instructions</th><td>{promotion.instructions || "None"}</td></tr>
        <tr><th scope="row">Approved</th><td>{promotion.approved_at ? formatStamp(promotion.approved_at) : "Not approved yet"}</td></tr>
        <tr><th scope="row">Designer</th><td>
          {promotion.workflow_status === "approved" && (person.role === "corporate" || person.role === "owner")
            ? <select className="ui-input" value={designer} onChange={(event) => setDesigner(event.target.value)}>
                <option value="">Choose a designer</option>
                {data.designers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            : data.designers.find((row) => row.id === promotion.assigned_to)?.name ?? (promotion.assigned_to ? "Assigned" : "Unassigned")}
        </td></tr>
      </tbody>
    </table>

    {step && <div className="ops-toolbar-actions">
      <Input value={reason} maxLength={500} placeholder="Reason or instructions (required for reject/revision/cancel)" onChange={(event) => setReason(event.target.value)} />
      <Button variant="soft" disabled={!!busy || (step.action !== "approve" && reason.trim().length < 3)} onClick={() => void onCommand(step.action, {
        id: promotion.id,
        version: promotion.version,
        reason: reason.trim(),
        designer_id: designer || undefined,
      })}>
        {busy === step.action ? "Working..." : step.label}
      </Button>
    </div>}

       <h3 className="ops-section-title">Artwork versions</h3>
    {!assets.length && <p className="ui-empty">No artwork uploaded yet.</p>}
    <ul className="ui-list">
      {assets.map((asset) => <li key={asset.id} className="ui-list-row">
        <Badge accent="purple">v{asset.version}</Badge>
        <div>
          <p className="ui-row-title">{asset.file_name}</p>
          <p className="ops-meta">Uploaded by {asset.uploaded_by_name ?? "a designer"} · {formatStamp(asset.created_at)} · {Math.round((asset.byte_size ?? 0) / 1024)} KB{asset.notes ? ` · ${asset.notes}` : ""}</p>
        </div>
        <a href={`/api/btb/platform/file/${asset.file_id}?download=1`} className="ops-link"><Download size={14} aria-hidden="true" /> Download</a>
      </li>)}
    </ul>

    {promotion.approved_at && ["in_progress", "awaiting_feedback", "revision_requested"].includes(promotion.workflow_status) && designer && <div className="ops-form">
      <label>Artwork file
        <input type="file" accept="application/pdf,image/png,image/jpeg" disabled={uploading || !!busy} onChange={(event) => void upload(event.target.files?.[0] ?? null)} />
      </label>
      <Input value={reason} maxLength={500} placeholder="Describe this version (required for revisions)" onChange={(event) => setReason(event.target.value)} />
    </div>}

    <h3 className="ops-section-title">Comments</h3>
    {!comments.length && <p className="ui-empty">No comments yet.</p>}
    <ul className="ui-list">
      {comments.map((entry) => <li key={entry.id} className="ui-list-row">
        <div><p className="ui-row-title">{entry.author_name}</p><p className="ops-meta">{formatStamp(entry.created_at)}</p></div>
        <p>{entry.body}</p>
      </li>)}
    </ul>
    <form className="ops-form" onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; void onCommand("comment", { id: promotion.id, version: promotion.version, body: comment.trim() }).then((ok) => { if (ok) setComment(""); }); }}>
      <Input value={comment} maxLength={4000} placeholder="Add feedback for this promotion" onChange={(event) => setComment(event.target.value)} />
      <Button type="submit" variant="ghost" disabled={!comment.trim() || !!busy}><MessageSquare size={16} aria-hidden="true" />Comment</Button>
    </form>

    <h3 className="ops-section-title">Audit history</h3>
    <ul className="ui-list">
      {history.slice(0, 20).map((entry) => <li key={entry.id} className="ui-list-row">
        <Badge accent="amber">{entry.action.replaceAll("_", " ")}</Badge>
        <div><p className="ops-meta">{formatStamp(entry.created_at)} · {entry.actor_name ?? "System"}{entry.reason ? ` · ${entry.reason}` : ""}</p></div>
      </li>)}
    </ul>

    <p className="ops-meta">Status flow: draft to submitted to corporate approval, then assignment, production, manager feedback and completion. A designer cannot skip corporate approval; approval by the requester is refused.</p>
  </div></Card>;
}


function CreateForm({ data, busy, onClose, onCreate }: {
  data: MarketingData | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (form: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [delivery, setDelivery] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("in");
  const [fileType, setFileType] = useState("pdf");
  const [formatId, setFormatId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [instructions, setInstructions] = useState("");
  const valid = title.trim().length >= 2 && purpose.trim().length >= 2 && start && end && delivery
    && end >= start && Number(width) > 0 && Number(height) > 0;

  return <Card><div className="ops-panel" aria-label="Request a promotion">
    <h2 className="ops-section-title">New promotion request</h2>
    <form className="ops-form" onSubmit={(event) => {
      event.preventDefault();
      if (!valid || busy) return;
      void onCreate({
        id: crypto.randomUUID(),
        title: title.trim(),
        purpose: purpose.trim(),
        description: description.trim(),
        promotion_start: start,
        promotion_end: end,
        delivery_date: delivery,
        format_id: formatId || null,
        dimensions: { width: Number(width), height: Number(height), unit },
        required_file_type: fileType,
        priority,
        instructions: instructions.trim(),
        reference_files: [],
      });
    }}>
      <div className="ops-form-grid">
        <label>Title<Input value={title} maxLength={120} required onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Purpose<Input value={purpose} maxLength={200} required placeholder="e.g. Autumn menu launch" onChange={(event) => setPurpose(event.target.value)} /></label>
        <label>Promotion start<Input type="date" value={start} required onChange={(event) => setStart(event.target.value)} /></label>
        <label>Promotion end<Input type="date" value={end} required min={start || undefined} onChange={(event) => setEnd(event.target.value)} /></label>
        <label>Artwork delivery<Input type="date" value={delivery} required onChange={(event) => setDelivery(event.target.value)} /></label>
        <label>Priority<select className="ui-input" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select></label>
        <label>Format<select className="ui-input" value={formatId} onChange={(event) => {
          setFormatId(event.target.value);
          const format = data?.formats.find((row) => row.id === event.target.value);
          if (format?.width && format.height) { setWidth(String(format.width)); setHeight(String(format.height)); setUnit(format.unit ?? "in"); }
        }}>
          <option value="">Custom size</option>
          {(data?.formats ?? []).map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}
        </select></label>
        <label>Width<Input inputMode="decimal" value={width} required onChange={(event) => setWidth(event.target.value)} /></label>
        <label>Height<Input inputMode="decimal" value={height} required onChange={(event) => setHeight(event.target.value)} /></label>
        <label>Unit<select className="ui-input" value={unit} onChange={(event) => setUnit(event.target.value)}>
          {["in", "ft", "px", "mm", "cm"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>File type<select className="ui-input" value={fileType} onChange={(event) => setFileType(event.target.value)}>
          <option value="pdf">PDF</option><option value="png">PNG</option><option value="jpg">JPG</option>
        </select></label>
      </div>
      <label>Description<Input value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Instructions<Input value={instructions} maxLength={1000} onChange={(event) => setInstructions(event.target.value)} /></label>
      <div className="ops-toolbar-actions">
        <Button type="submit" variant="soft" disabled={!valid || busy}><Send size={16} aria-hidden="true" />{busy ? "Saving..." : "Save draft"}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
      <p className="ops-meta">The request starts as a draft. Submit it and corporate approval is required before any designer may start.</p>
    </form>
  </div></Card>;
}
