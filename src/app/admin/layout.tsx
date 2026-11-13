import AppShell from "@/components/AppShell";
import ActivityTracker from "@/components/ActivityTracker";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ActivityTracker />
      {children}
    </AppShell>
  );
}
