import BtbServerPage from "@/components/btb/BtbServerPage";
import View from "./prep-sheet";

export default async function Page() {
  return await BtbServerPage({ page: "prep-list", children: <View /> });
}
