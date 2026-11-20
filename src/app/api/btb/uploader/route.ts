import { btbRoute, BtbApiError, requireBtbAccess } from "@/lib/btb-api";
import { BTB_CARDS } from "@/lib/btb-hub";
import { pageSlug } from "@/lib/btb-page-access";
import { requireBtbUploader } from "@/lib/btb-uploader";
import { BTB_RESTAURANT } from "@/lib/btb-team";
import { BTB_LOCATION_REFERENCE_PAGES } from "@/lib/btb-browser-scope";

export const GET = btbRoute(undefined, false, async (_, request) => {
  const page = new URL(request.url).searchParams.get("page");
  const card = BTB_CARDS.find(item => pageSlug(item) === page);
  if (!card || !page) throw new BtbApiError("Choose a workspace page.");
  const { db, identity } = await requireBtbAccess(card.feature, true, { page, allowLocationWorkspace: BTB_LOCATION_REFERENCE_PAGES.some(item => item === page) });
  return { userId: await requireBtbUploader(db), restaurantName: BTB_RESTAURANT, email: identity.email };
}, { allowLocationWorkspace: true });
