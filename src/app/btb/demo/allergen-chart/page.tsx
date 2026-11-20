import BtbServerPage from "@/components/btb/BtbServerPage";
import View from "./view";

export default async function Page() {
  return await BtbServerPage({ page: "allergen-chart", children: <View /> });
}
