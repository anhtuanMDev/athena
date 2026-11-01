import { createContext, useContext } from "react";
import { DEFAULT_CATEGORIES, type Category } from "./categories";

// The admin's record categories, loaded once by the _admin layout from
// data/_meta/categories.json; the built-in ones until then or if it fails.
const CategoriesContext = createContext<{ categories: readonly Category[]; reload: () => void }>({
  categories: DEFAULT_CATEGORIES,
  reload: () => {},
});

export const CategoriesProvider = CategoriesContext.Provider;

export function useCategories(): readonly Category[] {
  return useContext(CategoriesContext).categories;
}

/** Loads the categories again, after the Categories page saved them. */
export function useReloadCategories(): () => void {
  return useContext(CategoriesContext).reload;
}
