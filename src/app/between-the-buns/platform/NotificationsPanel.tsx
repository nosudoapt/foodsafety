"use client";

import { Bell, CircleAlert, Check } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import { useState } from "react";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
}

export interface NotificationData {
  notifications: NotificationRow[];
}

export default function NotificationsPanel({ data, loading, error, reload }: {
  data: NotificationData | null;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");

  const markRead = async (id: string) => {
    setBusy(id); setFailure("");
    try {
      await fetchJson("/api/btb/platform/notifications", jsonRequest({ id }));
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(""); }
  };

  return <>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    {data && <section className="ops-panel" aria-label="Notifications">
      <div className="ops-toolbar">
        <div>
          <h2 className="ops-section-title">Your notifications</h2>
          <p className="ops-meta">Assignments, approvals, incomplete daily records and certificate reminders arrive here.</p>
        </div>
        <Badge accent="purple">{data.notifications.filter((row) => !row.read_at).length} unread</Badge>
      </div>
      {!data.notifications.length && <Card><div className="ui-empty">
        <Bell size={28} aria-hidden="true" />
        <h2>No notifications yet</h2>
        <p>Notices about your location will appear here with a link back to the record.</p>
      </div></Card>}
      {data.notifications.map((row) => <article key={row.id} className={`ops-notification ${row.read_at ? "" : "ops-notification--unread"}`}>
        <div>
          <h3>{row.title}</h3>
          <p>{row.body}</p>
          <p className="ops-meta">{new Date(row.created_at).toLocaleString("en-CA", { timeZone: "America/Regina", dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <div className="ops-notification__actions">
          {row.read_at ? <Badge accent="slate"><Check size={12} aria-hidden="true" /> Read</Badge>
            : <Button variant="ghost" disabled={busy === row.id} onClick={() => void markRead(row.id)}>
              <CircleAlert size={14} aria-hidden="true" />{busy === row.id ? "Saving…" : "Mark read"}
            </Button>}
        </div>
      </article>)}
    </section>}
  </>;
}
