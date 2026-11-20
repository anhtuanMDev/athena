// Places in the enum form, typed as react-hook-form reads them.

/** An option's field: options.{index}.{key}. */
export function optionPath<K extends string>(index: number, key: K): `options.${number}.${K}` {
  return ["options", index, key].join(".") as `options.${number}.${K}`;
}

/** A param of an option: options.{optionIndex}.params.{index}. */
export function paramPath(optionIndex: number, index: number): `options.${number}.params.${number}` {
  return ["options", optionIndex, "params", index].join(".") as `options.${number}.params.${number}`;
}
