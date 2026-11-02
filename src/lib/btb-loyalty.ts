/** Approved BTB/MYR loyalty guidance, shared by the staff and customer views. */
export const LOYALTY_SEQUENCE = ["ASK", "SCAN", "VIEW OFFERS", "ENTER ORDER", "PAY LAST"] as const;
export const LOYALTY_REWARDS = [
  { title: "Welcome reward", reward: "Free appetizer", details: "Complete your profile. Allow up to 24 hours for activation. The reward is valid for 7 days; check the expiry shown in your account." },
  { title: "Birthday reward", reward: "Free appetizer", details: "Your profile must be completed at least 1 day before redemption. The reward is valid for 7 days; check the dates shown in your account." },
  { title: "Burger punch", reward: "Buy 5 eligible burgers, get 1 free", details: "The free reward covers the burger only, not a meal. It expires after 20 days. Cheese, toppings and upgrades cost extra. Only eligible burgers count." },
  { title: "Special & targeted offers", reward: "Offers personalized to your account", details: "Use only offers that are visible and valid in your account. Follow each offer’s eligible-item, date and expiry rules. Offers may differ between customers." },
] as const;
export const LOYALTY_CHANNELS = ["Dine-in", "Walk-in takeout", "Phone orders: scan at pickup before payment", "Signed-in MYR online pickup or delivery"] as const;
export const LOYALTY_EXCLUDED_CHANNELS = ["SkipTheDishes", "Uber Eats", "DoorDash"] as const;
export const LOYALTY_REDEMPTION = ["Scan the digital barcode first", "Review the account offer pop-up", "Confirm the customer’s choice", "Select the eligible item", "Apply the reward", "Collect any remaining balance"] as const;
export const LOYALTY_POINTS = ["Scan the barcode first", "Enter the order", "Select “Pay with Loyalty” at checkout", "Redeem available points", "Collect the remaining balance"] as const;
export const LOYALTY_WORKAROUND = {
  title: "Visible promotional reward blocked by a purchase requirement",
  rule: "For any visible, valid promotional reward that is blocked only by a purchase requirement, use the approved workaround below.",
  steps: ["Add “Various Item” for $0.05", "Apply the visible promotional reward", "Complete the $0.05 payment"],
  limit: "Never use this workaround for missing, expired or ineligible rewards. Never manually create or override a reward.",
} as const;
export const LOYALTY_ESCALATION = { name: "Kamal", phone: "306-314-9468", href: "tel:+13063149468" } as const;
