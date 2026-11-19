import Location from "@/components/btb-admin/Location";

export default async function LocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  return <Location id={(await params).locationId} />;
}
