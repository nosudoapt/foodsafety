import BtbServerPage from "@/components/btb/BtbServerPage";
import BtbHub from "./hub";

export default async function BetweenTheBunsHome() {
  return await BtbServerPage({ page: "", children: <BtbHub /> });
}
