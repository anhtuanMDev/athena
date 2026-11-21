// MUI takes a slot's props as an object or as a function of the component's
// state. The form fields lay their own props over the object kind; they never
// pass the function kind.

/** A slot's props, when given as an object; none otherwise. */
export function slotObject(slot: unknown): object {
  return typeof slot === "object" && slot !== null ? slot : {};
}
