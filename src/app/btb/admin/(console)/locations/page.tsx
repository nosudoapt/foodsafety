import Locations from "@/components/btb-admin/Locations";
import WorkspaceServerPage from "@/components/WorkspaceServerPage";

export default async function LocationsPage() { return await WorkspaceServerPage({ path: "/btb/admin/locations", children: <Locations /> }); }
