"use client";

import { useState } from "react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import ComplianceRegister from "@/components/ComplianceRegister";
import DocumentVault from "@/components/DocumentVault";
import TaxDatesPanel from "@/components/TaxDatesPanel";
import { PageHeader } from "@/components/ui";

// Combined compliance hub — renewals (expiring docs), tax & renewal dates
// (deadlines) and business documents (plain files) in one place. The three
// standalone routes still work; this is the single screen that shows all of
// them. Gated on "compliance": every role that can see this page
// (supervisor, manager, corporate) can already view all three sections.
export default function Page() {
  return (
    <BtbFeatureGate feature="compliance">
      {(readOnly) => <ComplianceHub readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

type Tab = "renewals" | "dates" | "documents";

function ComplianceHub({ readOnly }: { readOnly: boolean }) {
  const [tab, setTab] = useState<Tab>("renewals");

  const tabClass = (t: Tab) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      tab === t ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div>
      <PageHeader
        title="Compliance & Renewals"
        subtitle="Licences and permits · tax & renewal dates · business documents — one screen"
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setTab("renewals")} className={tabClass("renewals")}>
          Compliance Renewals
        </button>
        <button onClick={() => setTab("dates")} className={tabClass("dates")}>
          Tax & Renewal Dates
        </button>
        <button onClick={() => setTab("documents")} className={tabClass("documents")}>
          Business Documents
        </button>
      </div>

      {tab === "renewals" && <ComplianceRegister readOnly={readOnly} />}
      {tab === "dates" && <TaxDatesPanel readOnly={readOnly} showHeader={false} />}
      {tab === "documents" && (
        <DocumentVault
          title="Business Documents"
          subtitle="Forms, SOPs, brand assets & menus — files that don't expire"
          readOnly={readOnly}
          uploader={{ restaurantName: "The Grill House" }}
        />
      )}
    </div>
  );
}
