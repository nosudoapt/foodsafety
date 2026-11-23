import WorkspaceServerPage from "@/components/WorkspaceServerPage";
import View from "./view";
export default async function Page() { return await WorkspaceServerPage({ path: "/admin/protocols", children: <View /> }); }
