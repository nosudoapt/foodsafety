import { btbRoute } from "@/lib/btb-api";
import { BTB_CARDS } from "@/lib/btb-hub";
import { btbPageAllowed } from "@/lib/btb-page-access";
import { readTrainingManuals } from "@/lib/training-manuals";

export const GET = btbRoute("manuals", false, async ({ db, identity, access }) => {
  const card = BTB_CARDS.find(item => item.feature === "training_guide")!;
  if (!btbPageAllowed(card, identity.role, access.rows, access.pageGrants) || access.locationWorkspace && !["corporate", "owner"].includes(identity.role)) return { training: [] };
  return { training: await readTrainingManuals(db, []) };
}, { allowLocationWorkspace: true });
