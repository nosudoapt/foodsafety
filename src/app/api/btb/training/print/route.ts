import { btbRoute, requireBtbAccess } from "@/lib/btb-api";
import { readTrainingManuals } from "@/lib/training-manuals";

export const GET = btbRoute("manuals", false, async ({ db }) => {
  await requireBtbAccess("training_guide");
  return { training: await readTrainingManuals(db, []) };
});
