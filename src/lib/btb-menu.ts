export type Station = "fryer" | "line" | "hot-plate";

// One ingredient line on a recipe cheat sheet. A bare string renders in the
// default dark colour; a [name, station] tuple colours the line by the station
// that preps it, matching the printed charts: fryer = red, line = green,
// hot-plate = purple. Dips and "on the side" items stay uncoloured.
export type Ingredient = string | [name: string, station: Station];

export interface MenuItem {
  name: string;
  // Drives the cheat-sheet tabs. Mirrors the printed chart sections:
  // Signature Burgers, Classic Burgers, Garden Burgers, Kids & Lunch,
  // Handhelds, Salads, Smoothies, Milkshakes.
  category: string;
  ingredients: Ingredient[];
}

/** Display text of an ingredient line, tuple or not. */
export function ingredientName(ing: Ingredient): string {
  return typeof ing === "string" ? ing : ing[0];
}

/** Station colouring an ingredient line, or undefined for the default colour. */
export function ingredientStation(ing: Ingredient): Station | undefined {
  return typeof ing === "string" ? undefined : ing[1];
}

export const menuItems: MenuItem[] = [
  // SIGNATURE BURGERS
  { name: "Driving Crazy", category: "Signature Burgers", ingredients: [
    ["Elk patty", "hot-plate"], ["Swiss cheese", "hot-plate"], ["Honey mustard", "line"],
    ["Avocado sauce", "line"], ["Sriracha", "line"], ["Lettuce", "line"], ["Red onions", "line"],
  ] },
  { name: "Lamborghini", category: "Signature Burgers", ingredients: [
    ["Lamb patty", "hot-plate"], ["Feta cheese", "hot-plate"], ["Chipotle Mint", "line"],
    ["Red onions", "line"], ["Cucumber", "line"],
  ] },
  { name: "Oinker Delight", category: "Signature Burgers", ingredients: [
    ["Boar patty", "hot-plate"], ["BBQ Sauce", "line"], ["Spicy cranberry", "line"], ["Coleslaw", "line"],
  ] },
  { name: "Mission Bison", category: "Signature Burgers", ingredients: [
    ["Bison patty", "hot-plate"], ["Cheddar", "hot-plate"], ["Caramelized onions", "hot-plate"],
    ["Bacon x2", "hot-plate"], ["Bacon ketchup", "line"], ["Lettuce", "line"], ["Tomato", "line"],
  ] },

  // CLASSIC BURGERS
  { name: "Buffalo Crunch", category: "Classic Burgers", ingredients: [
    ["Fried chicken", "fryer"], ["Buffalo sauce toss", "line"], ["Honey slaw", "line"], ["Sliced pickles", "line"],
  ] },
  { name: "Cajun Bird", category: "Classic Burgers", ingredients: [
    ["Cajun breast", "hot-plate"], ["Cheddar", "hot-plate"], ["Caramelized onions", "hot-plate"],
    ["Smoky mayo", "line"], ["Lettuce", "line"], ["Tomato", "line"],
  ] },
  { name: "Gordon Turkey", category: "Classic Burgers", ingredients: [
    ["Turkey patty", "hot-plate"], ["Ham slices x2", "hot-plate"], ["Swiss cheese", "hot-plate"],
    ["Smoky mayo", "line"], ["Spicy cranberry", "line"], ["Lettuce", "line"], ["Tomato", "line"],
  ] },
  { name: "Fish N Chippy", category: "Classic Burgers", ingredients: [
    ["4 oz Cod fish (cut into 2)", "fryer"], ["3pcs fries", "fryer"], ["Swiss cheese", "hot-plate"],
    ["Tartar", "line"], ["Coleslaw", "line"],
  ] },
  { name: "Ridiculously Huge", category: "Classic Burgers", ingredients: [
    ["2x5 oz beef patty", "hot-plate"], ["Cheddar x2", "hot-plate"], ["Mushroom", "hot-plate"],
    ["Bacon x2", "hot-plate"], ["Smoky mayo", "line"], ["Lettuce", "line"], ["Tomato", "line"],
    ["Red onions", "line"], ["Pickles", "line"],
  ] },
  { name: "So Satisfrying", category: "Classic Burgers", ingredients: [
    ["5oz beef patty", "hot-plate"], ["Cheddar", "hot-plate"], ["Bacon x2", "hot-plate"],
    ["Onion ring x2", "fryer"], ["Fried pickle x1", "fryer"], ["Smoky mayo", "line"],
    ["Lettuce", "line"], ["Tomato", "line"],
  ] },
  { name: "Mozza Madness", category: "Classic Burgers", ingredients: [
    ["2x3oz beef patty", "hot-plate"], ["Mozza slice x1", "hot-plate"], ["Bacon x2", "hot-plate"],
    ["Mozza sticks x3", "fryer"], ["Smoky mayo", "line"], ["Lettuce", "line"], ["Tomato", "line"], ["Pickles", "line"],
  ] },
  { name: "Cheese Please", category: "Classic Burgers", ingredients: [
    ["5oz beef patty", "hot-plate"], ["Cheddar", "hot-plate"], ["Mozzarella", "hot-plate"],
    ["Smoky mayo", "line"], ["Lettuce", "line"], ["Tomato", "line"],
  ] },
  { name: "Chick N Licking", category: "Classic Burgers", ingredients: [
    ["Fried chicken", "fryer"], ["Parmesan cheese", "hot-plate"], ["Bacon x2", "hot-plate"],
    ["Caesar dressing", "line"], ["Lettuce", "line"],
  ] },

  // GARDEN BURGERS
  { name: "Aloo Tikki", category: "Garden Burgers", ingredients: [
    ["Aloo Tikki x1", "fryer"], ["Cheddar", "hot-plate"], ["Chipotle Mint", "line"], ["Ketchup", "line"],
    ["Lettuce", "line"], ["Red Onions", "line"], ["Cucumber", "line"],
  ] },
  { name: "Where Is The Beef", category: "Garden Burgers", ingredients: [
    ["Veggie Patty", "hot-plate"], ["Vegan Mayo", "line"], ["Lettuce", "line"], ["Tomato", "line"], ["Pickle", "line"],
  ] },

  // KIDS & LUNCH
  { name: "Kids Burger", category: "Kids & Lunch", ingredients: [
    ["3 oz Beef Patty", "hot-plate"], ["Cheddar", "hot-plate"], ["Ketchup", "line"],
  ] },
  { name: "Lunch Special Burger", category: "Kids & Lunch", ingredients: [
    ["2 x 3oz beef patty", "hot-plate"], ["Cheddar x1", "hot-plate"], ["Smoky mayo", "line"],
    ["Lettuce", "line"], ["Tomato", "line"],
  ] },

  // HANDHELDS
  { name: "Greek Chicken Wrap", category: "Handhelds", ingredients: [
    ["Grilled Chicken", "hot-plate"], ["Greek Dressing", "line"], ["Romaine", "line"], ["Cucumber", "line"],
    ["Tomato", "line"], ["Red Onions", "line"], ["Red Pepper", "line"], ["Black Olives", "line"],
    ["Feta", "line"], ["Oregano", "line"],
  ] },
  { name: "Chipotle Chicken Wrap", category: "Handhelds", ingredients: [
    ["Breaded Chicken Fingers x2", "fryer"], ["Chipotle Mayo", "line"], ["Romaine", "line"],
    ["Cheddar", "line"], ["Tomato", "line"], ["Onion", "line"],
  ] },
  { name: "Chicken Caesar Wrap", category: "Handhelds", ingredients: [
    ["Breaded Chicken Fingers x2", "fryer"], ["Bacon x2", "hot-plate"], ["Caesar Dressing", "line"],
    ["Romaine", "line"], ["Parmesan", "line"],
  ] },

  // SALADS
  { name: "Greek Salad", category: "Salads", ingredients: [
    ["Romaine", "line"], ["Cucumber", "line"], ["Tomato", "line"], ["Red Onions", "line"],
    ["Red Pepper", "line"], ["Black Olives", "line"], ["Feta", "line"], ["Oregano", "line"],
    ["Garlic Toast x1", "hot-plate"], "Greek Dressing (dip)",
  ] },
  { name: "Caesar Salad", category: "Salads", ingredients: [
    ["Romaine", "line"], ["Parmesan", "line"], ["Croutons", "line"], ["Lemon wedge x1", "line"],
    ["Bacon x2 chopped", "hot-plate"], ["Garlic Toast x1", "hot-plate"], "Caesar Dressing (dip)",
  ] },

  // SMOOTHIES (no station colouring — plain quantities)
  { name: "Pineapple Mango", category: "Smoothies", ingredients: [
    "6 pcs Mango", "4 pcs Pineapple", "1 large ice cube", "1.5 scoop frozen yogurt", "250 ml oat milk",
  ] },
  { name: "Strawberry Banana", category: "Smoothies", ingredients: [
    "5 pcs Strawberry", "7 pcs Banana", "1 large ice cube", "1.5 scoop frozen yogurt", "250 ml oat milk",
  ] },
  { name: "All Berry", category: "Smoothies", ingredients: [
    "Berry Mix – 1/3 cup", "1 large ice cube", "1.5 scoop frozen yogurt", "250 ml oat milk",
  ] },

  // MILKSHAKES (no station colouring — plain quantities)
  { name: "Vanilla", category: "Milkshakes", ingredients: [
    "125 ml milk", "2.5 scoops ice cream", "1.5 tbsp caramel syrup",
  ] },
  { name: "Strawberry", category: "Milkshakes", ingredients: [
    "125 ml milk", "2.5 scoops ice cream", "1.5 tbsp strawberry syrup",
  ] },
  { name: "Chocolate Oreo", category: "Milkshakes", ingredients: [
    "125 ml milk", "2.5 scoops ice cream", "1.5 tbsp chocolate syrup", "2 pc Oreo cookies",
  ] },
  { name: "Coffee", category: "Milkshakes", ingredients: [
    "125 ml milk", "2.5 scoops ice cream", "1 tbsp caramel syrup", "2 tsp coffee",
  ] },
  { name: "Biscoff", category: "Milkshakes", ingredients: [
    "125 ml milk", "2.5 scoops ice cream", "2 tbsp biscoff paste",
  ] },
  { name: "Kit Kat", category: "Milkshakes", ingredients: [
    "125 ml milk", "2.5 scoops ice cream", "2 oz Kit Kat mix",
  ] },
];

// Per-station text colour + label, sampled from the printed cheat sheets.
export const stationColors: Record<Station, { color: string; label: string }> = {
  fryer: { color: "#a8321f", label: "Fryer" },
  line: { color: "#2b6a2e", label: "Line" },
  "hot-plate": { color: "#30318f", label: "Hot Plate" },
};
