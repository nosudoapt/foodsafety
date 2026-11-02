"use client";

import Link from "next/link";
import { CircleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui";

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <div className="ui-empty" role="status"><span className="ui-loader" aria-hidden="true" /><p>Loading your records…</p></div>;
  if (error) return <div className="ui-empty"><CircleAlert size={28} aria-hidden="true" /><h2>Let’s reconnect.</h2><p role="alert">{error}</p><Button variant="ghost" onClick={onRetry}>Try again</Button></div>;
  return null;
}

export function IndividualLoginNotice({ next }: { next: string }) {
  return <div className="ui-notice"><UserRound size={20} aria-hidden="true" /><div><strong>Your work, under your name.</strong><p>Use your individual employee login to save checks and submit training. Ask your manager or supervisor to set up your account.</p><Link className="ops-text-link" href={`/between-the-buns/login?next=${encodeURIComponent(next)}`}>Sign in to my employee account</Link></div></div>;
}

export const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : "This change could not be saved. Please try again.";
export const jsonRequest = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
