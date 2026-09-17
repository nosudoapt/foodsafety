export type AllergenStatus = "contains" | "free" | "may-contain";

export interface BunAllergen {
  name: string;
  dairy: AllergenStatus;
  egg: AllergenStatus;
  gluten: AllergenStatus;
}

export const bunAllergens: BunAllergen[] = [
  {
    name: "Sesame",
    dairy: "may-contain",
    egg: "may-contain",
    gluten: "contains",
  },
  {
    name: "Brioche",
    dairy: "contains",
    egg: "may-contain",
    gluten: "contains",
  },
  {
    name: "Potato",
    dairy: "contains",
    egg: "free",
    gluten: "contains",
  },
  {
    name: "Pretzel",
    dairy: "free",
    egg: "free",
    gluten: "contains",
  },
  {
    name: "Gluten Free Bun",
    dairy: "free",
    egg: "contains",
    gluten: "free",
  },
];
