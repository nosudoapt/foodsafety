"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import NewRestaurantChecklist from "@/components/NewRestaurantChecklist";
export default function Page() {
  return (
    <BtbFeatureGate feature="new_restaurant">
      {(readOnly) => <NewRestaurantChecklist readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
