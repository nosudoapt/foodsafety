"use client";

import { useState } from "react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import ComplianceRegister from "@/components/ComplianceRegister";
import DocumentVault from "@/components/DocumentVault";
import TaxDatesPanel from "@/components/TaxDatesPanel";
import StaffLicencesPage from "@/app/between-the-buns/staff-licenses/page";
import LicenceRemindersPage from "@/app/between-the-buns/licence-reminders/page";
import { PageHeader, TabList } from "@/components/ui";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { btbCanEdit } from "@/lib/btb-access";
import { accessibleBtbCards } from "@/lib/btb-page-access";
import { BTB_RESTAURANT } from "@/lib/btb-roles";

// Combined compliance hub — renewals (expiring docs), tax & renewal dates
// (deadlines) and business documents (plain files) in one place. The three
// standalone routes and tabs share the same saved page restrictions.
export default function Page() {
  return (
    <BtbFeatureGate feature="compliance">
      {(readOnly) => <ComplianceHub readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

type Tab = "renewals" | "dates" | "documents" | "certs" | "reminders";
const SECTIONS = [
  { id: "renewals", label: "Renewals", page: "compliance" },
  { id: "certs", label: "Staff certificates", page: "staff-licenses" },
  { id: "dates", label: "Tax & filing dates", page: "tax-dates" },
  { id: "documents", label: "Business documents", page: "documents" },
  { id: "reminders", label: "Email reminders", page: "licence-reminders" },
] as const;

function ComplianceHub({ readOnly }: { readOnly: boolean }) {
  const [tab, setTab] = useState<Tab>("renewals");
  const { identity, rows } = useBtbWorkspace();
  if (!identity) return null;
  const allowed = accessibleBtbCards(identity.role, rows);
  const tabs = SECTIONS.filter((section) => allowed.some((card) => card.href === `/between-the-buns/${section.page}`));
  const active = tabs.some((section) => section.id === tab) ? tab : "renewals";

  return (
    <div className="compliance-hub">
      <PageHeader
        title="Compliance, docs & reminders"
        subtitle="Licences, deadlines, staff certificates, documents and reminder emails — together, ready for the next review."
      />

      <TabList id="btb-compliance" label="Compliance sections" tabs={tabs} value={active} onChange={setTab} />
      {tabs.map((section) => <section key={section.id} role="tabpanel" tabIndex={0}
        id={`btb-compliance-panel-${section.id}`} aria-labelledby={`btb-compliance-tab-${section.id}`} hidden={active !== section.id}>
        {active === section.id && (section.id === "renewals" ? <ComplianceRegister readOnly={readOnly} restaurant={BTB_RESTAURANT} showHeader={false} />
          : section.id === "dates" ? <TaxDatesPanel readOnly={!btbCanEdit("tax_dates", identity.role)} showHeader={false} />
          : section.id === "certs" ? <StaffLicencesPage />
          : section.id === "reminders" ? <LicenceRemindersPage />
          : <DocumentVault title="Business documents" subtitle="Forms, SOPs, brand assets & menus — files that don’t expire."
            readOnly={!btbCanEdit("documents", identity.role)} showHeader={false} uploader={{ restaurantName: BTB_RESTAURANT }} />)}
      </section>)}
    </div>
  );
}
