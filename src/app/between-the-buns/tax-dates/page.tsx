"use client";

import BtbFeatureGate from "@/components/BtbFeatureGate";
import TaxDatesPanel from "@/components/TaxDatesPanel";

// Filing deadlines + renewals for the whole company (or one site). Everyone
// may read; managers add and remove entries.
export default function TaxDatesPage() {
  return (
    <BtbFeatureGate feature="tax_dates">
      {(readOnly) => <TaxDatesPanel readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
