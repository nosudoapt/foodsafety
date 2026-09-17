export interface PrepItem {
  name: string;
  unit: string;
  par: string;
}

export interface PrepSection {
  title: string;
  items: PrepItem[];
}

export interface PrepGroup {
  label: string;
  sections: PrepSection[];
}

export const prepGroups: PrepGroup[] = [
  {
    label: "Produce & Starches",
    sections: [
      {
        title: "Produce",
        items: [
          { name: "Burger Tomatoes", unit: "1/6 S", par: "" },
          { name: "Caramelized Onions", unit: "1/6 S", par: "" },
          { name: "Cauliflower", unit: "por", par: "" },
          { name: "Coleslaw", unit: "1/3 S", par: "" },
          { name: "Cucumber Sliced", unit: "1/9 D", par: "" },
          { name: "Grated Feta Cheese", unit: "1/9 D", par: "" },
          { name: "Lemon Wedge", unit: "1/9 D", par: "" },
          { name: "Red Onion Diced", unit: "1/9 D", par: "" },
          { name: "Red Onion Sliced", unit: "1/9 D", par: "" },
          { name: "Red Pepper Diced", unit: "1/9 D", par: "" },
          { name: "Red Pepper Sliced", unit: "1/9 D", par: "" },
          { name: "Romaine", unit: "cambio", par: "" },
          { name: "Sliced Mushroom", unit: "1/9 D", par: "" },
          { name: "Tomato Diced", unit: "1/9 D", par: "" },
        ],
      },
      {
        title: "Starches",
        items: [
          { name: "Breading", unit: "litres", par: "" },
          { name: "Cajun Spice", unit: "litres", par: "" },
          { name: "Gravy", unit: "litres", par: "" },
          { name: "Oreo Batter", unit: "litres", par: "" },
          { name: "Yam Fries", unit: "por", par: "" },
          { name: "Rice Patty", unit: "por", par: "" },
          { name: "Fried Onions", unit: "1/9 D", par: "" },
        ],
      },
    ],
  },
  {
    label: "Sauces & Meats",
    sections: [
      {
        title: "Sauces",
        items: [
          { name: "Avocado Sauce", unit: "1/9 D", par: "" },
          { name: "Bacon Ketchup", unit: "1/9 D", par: "" },
          { name: "Buffalo Ranch", unit: "litres", par: "" },
          { name: "Chipotle Mayo", unit: "litres", par: "" },
          { name: "Chipotle Mint", unit: "1/9 D", par: "" },
          { name: "Greek Dressing", unit: "litres", par: "" },
          { name: "Herbed Mayo", unit: "litres", par: "" },
          { name: "Mint Chutney", unit: "litres", par: "" },
          { name: "Smoky Mayo", unit: "1/9 D", par: "" },
          { name: "Spicy Mayo", unit: "litres", par: "" },
          { name: "Spicy Cranberry", unit: "1/9 D", par: "" },
          { name: "Strawberry Bacon Jam", unit: "1/6 D", par: "" },
        ],
      },
      {
        title: "Meats",
        items: [
          { name: "Bacon Cooked", unit: "1/3 D", par: "" },
          { name: "Bison Patty", unit: "portion", par: "" },
          { name: "Boar Patty", unit: "portion", par: "" },
          { name: "Buttermilk Tender", unit: "1/2 D", par: "" },
          { name: "Chicken Butterfly", unit: "1/3 D", par: "" },
          { name: "Crispy Chicken", unit: "portion", par: "" },
          { name: "Dry Ribs", unit: "portion", par: "" },
          { name: "Elk Patty", unit: "portion", par: "" },
          { name: "Lamb Patty", unit: "portion", par: "" },
          { name: "Turkey", unit: "portion", par: "" },
        ],
      },
    ],
  },
  {
    label: "Freezer & Dairy",
    sections: [
      {
        title: "Freezer Pull",
        items: [
          { name: "Guacamole", unit: "", par: "" },
          { name: "Bacon", unit: "", par: "" },
          { name: "Bison", unit: "", par: "" },
          { name: "Boar", unit: "", par: "" },
          { name: "Brioche Buns", unit: "", par: "" },
          { name: "Chicken Tenders", unit: "", par: "" },
          { name: "Chicken Breast 5oz", unit: "", par: "" },
          { name: "Cod Fish", unit: "", par: "" },
          { name: "Elk", unit: "", par: "" },
          { name: "Lamb", unit: "", par: "" },
          { name: "Naan Bread", unit: "", par: "" },
          { name: "Potato Buns", unit: "", par: "" },
          { name: "Pretzel Buns", unit: "", par: "" },
          { name: "Sesame Buns", unit: "", par: "" },
          { name: "Turkey", unit: "", par: "" },
          { name: "Wraps", unit: "", par: "" },
          { name: "Sour Dough Bun", unit: "", par: "" },
          { name: "Hot Dog", unit: "", par: "" },
          { name: "Hot Dog Bun", unit: "", par: "" },
        ],
      },
      {
        title: "Dairy",
        items: [
          { name: "Cheese Curds", unit: "Por", par: "" },
          { name: "Ice Cream Portion", unit: "Por", par: "" },
        ],
      },
    ],
  },
];
