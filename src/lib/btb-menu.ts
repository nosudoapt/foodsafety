export type Station = "fryer" | "line" | "hot-plate";

export interface MenuItem {
  name: string;
  category: string;
  section: string;
  ingredients: string[];
  station?: Station;
}

export const menuItems: MenuItem[] = [
  // SIGNATURE BURGERS
  {
    name: "Driving Crazy",
    category: "Burgers",
    section: "Signature",
    ingredients: [
      "Elk patty",
      "Swiss cheese",
      "Honey mustard",
      "Avocado sauce",
      "Sriracha",
      "Lettuce",
      "Red onions",
    ],
    station: "hot-plate",
  },
  {
    name: "Lamborghini",
    category: "Burgers",
    section: "Signature",
    ingredients: [
      "Lamb patty",
      "Feta cheese",
      "Mint chipotle",
      "Red onions",
      "Cucumber",
    ],
    station: "hot-plate",
  },
  {
    name: "Oinker Delight",
    category: "Burgers",
    section: "Signature",
    ingredients: [
      "Boar patty",
      "BBQ",
      "Spicy cranberry",
      "Coleslaw",
    ],
    station: "hot-plate",
  },
  {
    name: "Mission Bison",
    category: "Burgers",
    section: "Signature",
    ingredients: [
      "Bison patty",
      "Cheddar",
      "Caramelized onions",
      "Bacon x2",
      "Bacon ketchup",
      "Lettuce",
      "Tomato",
    ],
    station: "hot-plate",
  },

  // CLASSIC BURGERS
  {
    name: "Buffalo Crunch",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "Fried chicken",
      "Buffalo sauce toss",
      "Honey slaw",
      "Sliced pickles",
    ],
    station: "fryer",
  },
  {
    name: "Cajun Bird",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "Cajun breast",
      "Cheddar",
      "Caramelized onions",
      "Smoky mayo",
      "Lettuce",
      "Tomato",
    ],
    station: "line",
  },
  {
    name: "Gordon Turkey",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "Turkey patty",
      "Ham slices x2",
      "Swiss",
      "Smoky mayo",
      "Spicy cranberry",
      "Lettuce",
      "Tomato",
    ],
    station: "hot-plate",
  },
  {
    name: "Fish N Chippy",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "4 oz Cod fish (cut into 2)",
      "3pcs fries",
      "Swiss cheese",
      "Tartar",
      "Coleslaw",
    ],
    station: "fryer",
  },
  {
    name: "Ridiculously Huge",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "2x5 oz beef patty",
      "Cheddar x2",
      "Mushroom",
      "Bacon x2",
      "Smoky mayo",
      "Lettuce",
      "Tomato",
      "Red onions",
      "Pickles",
    ],
    station: "hot-plate",
  },
  {
    name: "So Satisfrying",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "5oz beef patty",
      "Cheddar",
      "Bacon x2",
      "Onion ring x2",
      "Fried pickle x1",
      "Smoky mayo",
      "Lettuce",
      "Tomato",
    ],
    station: "hot-plate",
  },
  {
    name: "Mozza Madness",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "2x3oz beef patty",
      "Mozza slice x1",
      "Bacon x2",
      "Mozza sticks x3",
      "Smoky mayo",
      "Lettuce",
      "Tomato",
      "Pickles",
    ],
    station: "hot-plate",
  },
  {
    name: "Cheese Please",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "5oz beef patty",
      "Cheddar",
      "Mozza",
      "Smoky mayo",
      "Lettuce",
      "Tomato",
    ],
    station: "hot-plate",
  },
  {
    name: "Chick N Licking",
    category: "Burgers",
    section: "Classic",
    ingredients: [
      "Fried chicken",
      "Parmesan",
      "Bacon x2",
      "Caesar dressing",
      "Lettuce",
    ],
    station: "fryer",
  },

  // GARDEN BURGERS
  {
    name: "Aloo Tikki",
    category: "Burgers",
    section: "Garden",
    ingredients: [
      "Aloo Tikki x1",
      "Cheddar",
      "Chipotle Mint",
      "Ketchup",
      "Lettuce",
      "Red Onions",
      "Cucumber",
    ],
    station: "fryer",
  },
  {
    name: "Where Is The Beef",
    category: "Burgers",
    section: "Garden",
    ingredients: [
      "Veggie Patty",
      "Vegan Mayo",
      "Lettuce",
      "Tomato",
      "Pickle",
    ],
    station: "hot-plate",
  },

  // KIDS & LUNCH
  {
    name: "Kids Burger",
    category: "Kids & Lunch",
    section: "Kids",
    ingredients: [
      "3 oz Beef Patty",
      "Cheddar",
      "Ketchup",
    ],
    station: "hot-plate",
  },
  {
    name: "Lunch Special Burger",
    category: "Kids & Lunch",
    section: "Lunch",
    ingredients: [
      "2 x 3oz beef patty",
      "Cheddar x1",
      "Smoky mayo",
      "Lettuce",
      "Tomato",
    ],
    station: "hot-plate",
  },

  // HANDHELDS
  {
    name: "Greek Chicken Wrap",
    category: "Handhelds",
    section: "Wraps",
    ingredients: [
      "Romaine",
      "Greek Dressing",
      "Cucumber",
      "Tomato",
      "Red Onions",
      "Red Pepper",
      "Black Olives",
      "Feta",
      "Oregano",
    ],
  },
  {
    name: "Chipotle Chicken Wrap",
    category: "Handhelds",
    section: "Wraps",
    ingredients: [
      "Breaded Chicken Fingers x2",
      "Romaine",
      "Cheddar",
      "Chipotle",
      "Tomato",
      "Onion",
    ],
  },
  {
    name: "Chicken Caesar Wrap",
    category: "Handhelds",
    section: "Wraps",
    ingredients: [
      "Breaded Chicken Fingers x2",
      "Romaine",
      "Parmesan",
      "Bacon",
      "Caesar Dressing",
    ],
  },

  // SALADS
  {
    name: "Greek Salad",
    category: "Salads",
    section: "Salads",
    ingredients: [
      "Romaine",
      "Greek Dressing",
      "Cucumber",
      "Tomato",
      "Red Onions",
      "Red Pepper",
      "Black Olives",
      "Feta",
      "Oregano",
      "Garlic Toast",
    ],
  },
  {
    name: "Caesar Salad",
    category: "Salads",
    section: "Salads",
    ingredients: [
      "Romaine",
      "Caesar Dressing",
      "Parmesan",
      "Bacon x2",
      "Croutons",
      "Garlic Toast",
    ],
  },

  // SMOOTHIES
  {
    name: "Pineapple Mango",
    category: "Drinks",
    section: "Smoothies",
    ingredients: [
      "6 pcs Mango",
      "4 pcs Pineapple",
      "1 large ice cube",
      "1.5 scoop frozen yogurt",
      "250 ml oat milk",
    ],
  },
  {
    name: "Strawberry Banana",
    category: "Drinks",
    section: "Smoothies",
    ingredients: [
      "5 pcs Strawberry",
      "7 pcs Banana",
      "1 large ice cube",
      "1.5 scoop frozen yogurt",
      "250 ml oat milk",
    ],
  },
  {
    name: "All Berry",
    category: "Drinks",
    section: "Smoothies",
    ingredients: [
      "Berry Mix – 1/3 cup",
      "1 large ice cube",
      "1.5 scoop frozen yogurt",
      "250 ml oat milk",
    ],
  },

  // MILKSHAKES
  {
    name: "Vanilla Milkshake",
    category: "Drinks",
    section: "Milkshakes",
    ingredients: [
      "125 ml milk",
      "2.5 scoops ice cream",
      "1.5 tbsp caramel syrup",
    ],
  },
  {
    name: "Strawberry Milkshake",
    category: "Drinks",
    section: "Milkshakes",
    ingredients: [
      "125 ml milk",
      "2.5 scoops ice cream",
      "1.5 tbsp strawberry syrup",
    ],
  },
  {
    name: "Chocolate Oreo Milkshake",
    category: "Drinks",
    section: "Milkshakes",
    ingredients: [
      "125 ml milk",
      "2.5 scoops ice cream",
      "1.5 tbsp chocolate syrup",
      "2 pc Oreo cookies",
    ],
  },
  {
    name: "Coffee Milkshake",
    category: "Drinks",
    section: "Milkshakes",
    ingredients: [
      "125 ml milk",
      "2.5 scoops ice cream",
      "1 tbsp caramel syrup",
      "2 tsp coffee",
    ],
  },
  {
    name: "Biscoff Milkshake",
    category: "Drinks",
    section: "Milkshakes",
    ingredients: [
      "125 ml milk",
      "2.5 scoops ice cream",
      "2 tbsp biscoff paste",
    ],
  },
  {
    name: "Kit Kat Milkshake",
    category: "Drinks",
    section: "Milkshakes",
    ingredients: [
      "125 ml milk",
      "2.5 scoops ice cream",
      "2 oz Kit Kat mix",
    ],
  },
];

export const procedures = {
  Smoothies: {
    title: "Smoothie Procedure",
    steps: [
      "In a blender, add fruits, one large ice cube.",
      "Add 1.5 scoop of frozen yogurt.",
      "Add 250 ml of oat milk.",
      "Blend until smooth consistency.",
      "Transfer into the glass, cover it and serve it with straw.",
    ],
  },
  Milkshakes: {
    title: "Milkshake Procedure",
    steps: [
      "Pour milk into the glass, then ice cream (Size 6 scoop) and add flavour, blend it in milkshake machine.",
      "Transfer into the glass (add whip if requested) cover it and serve it with straw.",
    ],
  },
};

export const stationColors: Record<Station, { bg: string; text: string; label: string }> = {
  fryer: { bg: "bg-red-100", text: "text-red-700", label: "Fryer" },
  line: { bg: "bg-green-100", text: "text-green-700", label: "Line" },
  "hot-plate": { bg: "bg-purple-100", text: "text-purple-700", label: "Hot Plate" },
};
