import Location from "@/components/btb-admin/Location";
import WorkspaceServerPage from "@/components/WorkspaceServerPage";

export default async function LocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  return await WorkspaceServerPage({ path: "/btb/admin/locations", locationId, children: <Location id={locationId} /> });
}
