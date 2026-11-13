"use client";

import { useState } from "react";
import { BadgeCheck, Gift, Phone, ScanBarcode } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import ManualPdfSlot from "@/components/ManualPdfSlot";
import { Badge, Card, PageHeader, TabList } from "@/components/ui";
import { LOYALTY_CHANNELS, LOYALTY_ESCALATION, LOYALTY_EXCLUDED_CHANNELS, LOYALTY_POINTS, LOYALTY_REDEMPTION, LOYALTY_REWARDS, LOYALTY_SEQUENCE, LOYALTY_WORKAROUND } from "@/lib/btb-loyalty";

export default function LoyaltyPage() {
  return <BtbFeatureGate feature="loyalty_rewards">{() => <LoyaltyGuides />}</BtbFeatureGate>;
}

function Steps({ steps }: { steps: readonly string[] }) {
  return <ol className="loyalty-steps">{steps.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>)}</ol>;
}

function RewardCards() {
  return <div className="loyalty-rewards">{LOYALTY_REWARDS.map((reward) => <Card className="loyalty-reward" key={reward.title}><Gift size={22} aria-hidden="true" /><p className="ops-meta">{reward.title}</p><h3>{reward.reward}</h3><p>{reward.details}</p></Card>)}</div>;
}

function Channels() {
  return <Card className="loyalty-block"><div className="ops-card-heading"><BadgeCheck size={23} aria-hidden="true" /><h2>Where loyalty works</h2></div><ul className="loyalty-list">{LOYALTY_CHANNELS.map((channel) => <li key={channel}>{channel}</li>)}</ul><div className="ui-notice ui-notice--warning"><p>Third-party orders through <strong>{LOYALTY_EXCLUDED_CHANNELS.join(", ")}</strong> are excluded from the loyalty program.</p></div></Card>;
}

function LoyaltyGuides() {
  const [view, setView] = useState<"employee" | "customer">("employee");
  return <div className="ops-workspace"><PageHeader title="Loyalty rewards" subtitle="Two clear guides. One simple rule: show and scan the barcode first." /><TabList id="loyalty" label="Loyalty guides" value={view} onChange={setView} tabs={[{ id: "employee", label: "Employee guide" }, { id: "customer", label: "Customer guide" }]} />
    <ManualPdfSlot title="Loyalty manual" category="training" heading="Loyalty Manual (PDF)" accent="rust" />
    {view === "employee" ? <div className="ops-workspace" role="tabpanel" id="loyalty-panel-employee" aria-labelledby="loyalty-tab-employee"><section className="loyalty-hero"><ScanBarcode size={32} aria-hidden="true" /><p className="dash-focus__label">At the register</p><h2>Barcode first. Payment last.</h2><p>Ask whether the customer has loyalty. Scan their digital barcode <strong>before entering the order</strong>, then review the offers on their account.</p><div className="loyalty-sequence" aria-label={LOYALTY_SEQUENCE.join(" → ")}>{LOYALTY_SEQUENCE.map((step, index) => <span key={step}>{index > 0 && <span aria-hidden="true">→</span>}<strong>{step}</strong></span>)}</div></section>
      <section className="ops-workspace"><div className="ops-section-heading"><h2>Know the rewards</h2><Badge accent="purple">Check the account pop-up</Badge></div><RewardCards /></section>
      <div className="loyalty-two-column"><Card className="loyalty-block"><h2>Redeem a reward</h2><Steps steps={LOYALTY_REDEMPTION} /><p className="ops-meta">Apply only the customer’s chosen, visible and eligible reward. Collect the cost of extras and any remaining order balance.</p></Card><Card className="loyalty-block"><h2>Redeem points</h2><Steps steps={LOYALTY_POINTS} /><p className="ops-meta">Use the points actually available in the customer’s account.</p></Card></div>
      <Card className="loyalty-block"><Badge accent="amber">Approved purchase-requirement workaround</Badge><h2>{LOYALTY_WORKAROUND.title}</h2><p>{LOYALTY_WORKAROUND.rule}</p><Steps steps={LOYALTY_WORKAROUND.steps} /><div className="ui-notice ui-notice--warning">{LOYALTY_WORKAROUND.limit}</div></Card>
      <Channels />
      <div className="loyalty-two-column"><Card className="loyalty-block"><h2>Phone, pickup & online orders</h2><ul className="loyalty-list"><li><strong>Phone / pay on arrival:</strong> scan the customer’s barcode at pickup before payment. Review the account and apply eligible rewards before collecting the balance.</li><li><strong>Paid MYR online orders:</strong> when the customer ordered while signed in, points and rewards should post automatically. Check the signed-in account and the order details if they do not.</li></ul></Card><Card className="loyalty-block"><h2>If a reward is missing</h2><Steps steps={["Check that the profile is complete", "For a new profile, allow up to 24 hours", "Check whether the reward is visible, valid and unexpired", "Review the offer’s item and channel eligibility", "Escalate rather than creating or overriding a reward"]} /><a href={LOYALTY_ESCALATION.href} className="ops-text-link"><Phone size={16} aria-hidden="true" />&nbsp;{LOYALTY_ESCALATION.name}: {LOYALTY_ESCALATION.phone}</a></Card></div>
    </div> : <div className="ops-workspace" role="tabpanel" id="loyalty-panel-customer" aria-labelledby="loyalty-tab-customer"><section className="loyalty-hero"><Gift size={32} aria-hidden="true" /><p className="dash-focus__label">A little more to look forward to</p><h2>Your next visit, rewarded.</h2><p>Complete your profile, allow up to 24 hours for activation, and show your digital barcode before your order is entered.</p><Steps steps={["Complete your loyalty profile", "Wait up to 24 hours for activation", "Show your digital barcode first", "Choose and redeem an available reward at checkout"]} /></section><section className="ops-workspace"><h2 className="training-subheading">Your rewards at a glance</h2><RewardCards /></section><Channels /><Card className="loyalty-block"><h2>Use your rewards and points</h2><p>Show your barcode first. A team member can help you review your available rewards and choose an eligible item. At checkout, apply the reward or redeem your available points using <strong>“Pay with Loyalty”</strong>, then pay the remaining balance.</p><p>For phone orders, show your barcode at pickup before payment. For MYR online pickup or delivery, sign in to your loyalty account when ordering; paid online orders should post points and rewards automatically.</p></Card><Card className="loyalty-block"><h2>Your account, your offers</h2><p>Special and targeted offers are personalized and may differ between customers. Check the offers visible in your own account and follow each offer’s item, date and expiry terms. Only visible, valid and eligible rewards can be redeemed.</p><p>Welcome and birthday appetizer rewards are valid for 7 days. The burger punch reward expires after 20 days, covers the burger only, and excludes the meal and paid cheese, toppings or upgrades.</p><p>Complete your profile to activate rewards. For a birthday reward, your profile must be complete at least 1 day before redemption. If your welcome reward has not appeared, check your completed profile and allow up to 24 hours.</p><p>Check your account for current points availability, program terms and each reward’s expiry before ordering.</p></Card><div className="loyalty-question"><h2>Questions? Ask a team member.</h2><p>We’ll help you find your barcode, review an offer, or understand your next reward.</p></div></div>}
  </div>;
}
