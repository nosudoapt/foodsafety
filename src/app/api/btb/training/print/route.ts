import { btbRoute } from "@/lib/btb-api";
import { BTB_CARDS } from "@/lib/btb-hub";
import { btbPageAllowed } from "@/lib/btb-page-access";
import { readTrainingManuals } from "@/lib/training-manuals";

export const GET = btbRoute("manuals", false, async ({ db, identity, access }) => {
  const card = BTB_CARDS.find(item => item.feature === "training_guide")!;
  // A location-workspace employee may print the training manuals they can
  // already open; the page grant is the only gate here.
  if (!btbPageAllowed(card, identity.role, access.rows, access.pageGrants)) return { training: [] };
  return { training: await readTrainingManuals(db, []) };
}, { allowLocationWorkspace: true });
