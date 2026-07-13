# Schema-Driven Rendering Rules — React Native App

Companion to `design.md`. That file defines how things should _look_; this file defines how the app is _architected_ so that new games, new categories, and changing schemas require **zero app code changes** — only new layout-config JSON produced by the admin website.

Read this before adding a screen, a block/primitive component, or changing how data flows from admin → app.

---

## 0. The core rule

> **The app renders configs, not games.**

The React Native codebase must never contain game-specific or category-specific logic (`if gameId === 'valorant'`, `HeroScreenValorant.tsx`, etc.). It contains a fixed **registry of primitive block components** (Section 2) and one **generic renderer** (Section 3) that walks a JSON layout config and mounts the right block for each entry, bound to the right data fields.

If you ever find yourself writing a conditional keyed on a specific game or a specific category name inside a component, stop — that decision belongs in the layout config, not the code.

---

## 1. The three layers

```
DATA            → raw values for one entity (a hero, item, map, mode, event...)
LAYOUT CONFIG   → JSON: which primitives, in what order, bound to which data fields, with what props
COMPONENT REGISTRY → fixed set of RN components the app ships with, one per primitive type
```

- **DATA** comes from the game content API — shape varies per game/category, that's expected and fine.
- **LAYOUT CONFIG** is produced and owned by the **admin website**. It is the only thing that changes when you want a category to look/show differently. Treat it as content, not code.
- **COMPONENT REGISTRY** is the only part that requires an app release to change. Keep it small and generic (Section 2).

---

## 2. Primitive registry

This list mirrors `design.md` Section 6's field-type primitives. Every primitive is a standalone RN component with a strict prop contract. Do not create a new primitive unless a genuinely new _shape_ of content appears that can't be composed from these — see Section 7 before adding one.

| Primitive              | Purpose                                               | Key props                                                             |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `image_hero`           | Large feature image (portrait, banner)                | `field`, `aspect`, `overflow?`, `duotone?`                            |
| `image_grid`           | Gallery / thumbnails (skins, maps)                    | `field` (array), `aspect`, `scroll: 'x'\|'wrap'`                      |
| `title`                | Name + optional subtitle/eyebrow                      | `field`, `subField?`, `eyebrowField?`                                 |
| `stat_grid`            | Label+value cells, reflowing                          | `items: [{label, field, unit?, format?}]`, `columns?: 'auto'\|number` |
| `progress_bar`         | Bar/ring for bounded numeric values                   | `field`, `max` (literal or `maxField`), `variant: 'bar'\|'ring'`      |
| `icon_grid`            | Repeating icon+label cells (abilities, items, perks)  | `field` (array), `iconField`, `labelField`, `columns?`                |
| `tag_list`             | Chips/badges                                          | `field` (array) or `fields: string[]`                                 |
| `long_text`            | Paragraph content (lore, description)                 | `field`, `collapsible?: boolean`, `maxLines?`                         |
| `key_value_list`       | Simple rows (release date, dev, patch#)               | `items: [{label, field}]`                                             |
| `related_list`         | Cards linking to other entities (counters, synergies) | `field` (array of entity refs), `entityType`                          |
| `section_header`       | Standalone divider/heading, no data binding           | `text` (literal, not field-bound)                                     |
| `connector_annotation` | Label-to-region line over an image (design.md 4.3)    | `targetField` (the image block id), `points: [{x,y,label}]`           |

Every primitive:

- Degrades gracefully with missing/empty data (Section 5).
- Reads visual tokens (radius, spacing, color, type scale) from the shared theme — never inline styles that hardcode a size/color, per `design.md`.
- Is presentational only. No data fetching, no business logic inside a block component.

---

## 3. The renderer

```tsx
// registry.ts
export const REGISTRY = {
  image_hero: ImageHeroBlock,
  image_grid: ImageGridBlock,
  title: TitleBlock,
  stat_grid: StatGridBlock,
  progress_bar: ProgressBarBlock,
  icon_grid: IconGridBlock,
  tag_list: TagListBlock,
  long_text: LongTextBlock,
  key_value_list: KeyValueListBlock,
  related_list: RelatedListBlock,
  section_header: SectionHeaderBlock,
  connector_annotation: ConnectorAnnotationBlock,
} as const;

export type PrimitiveType = keyof typeof REGISTRY;

export interface LayoutSection {
  id: string; // stable id, used as key + connector target
  type: PrimitiveType;
  props: Record<string, any>; // shape depends on `type`, see Section 2
  visible?: boolean; // admin-controlled show/hide, default true
}

export interface LayoutConfig {
  schemaVersion: number;
  gameId: string;
  category: string; // 'hero' | 'item' | 'map' | 'mode' | 'event' | ...
  sections: LayoutSection[];
}
```

```tsx
// SchemaRenderer.tsx
function SchemaRenderer({
  layout,
  data,
}: {
  layout: LayoutConfig;
  data: Record<string, unknown>;
}) {
  return (
    <>
      {layout.sections
        .filter((s) => s.visible !== false)
        .map((section) => {
          const Block = REGISTRY[section.type];
          if (!Block) {
            if (__DEV__)
              console.warn(
                `Unknown primitive type "${section.type}" — skipped`,
              );
            return null; // unknown type never crashes the screen
          }
          return (
            <Block
              key={section.id}
              id={section.id}
              {...section.props}
              data={data}
            />
          );
        })}
    </>
  );
}
```

**One `SchemaRenderer` powers every category and every game.** A "hero detail screen," an "item detail screen," and a "map detail screen" are the _same_ component tree — `<SchemaRenderer layout={layout} data={data} />` — the only difference is which layout config and which data got fetched.

---

## 4. Field resolution

Fields in props (`field: "stats.health"`) are dot-path strings resolved against `data` at render time.

```ts
function resolveField(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc: any, key) => acc?.[key], data);
}
```

Rules:

- Support dot-paths for nesting (`stats.health`) and bracket-free array indices only when unavoidable (`abilities.0.name`) — prefer arrays go through array-typed primitives (`icon_grid`, `related_list`) instead of manual indexing.
- Every block resolves its own fields internally from the raw `field` string + the passed-down `data` object — the renderer never pre-resolves data, so blocks stay reusable and testable standalone.
- Formatting (number rounding, unit suffix, date format) is a prop (`format?: 'percent' | 'seconds' | 'integer' | ...`) applied inside the block, not baked into the data.

---

## 5. Graceful degradation (this is the whole point)

Because schemas vary per game/category, every block must handle the full range without special-casing:

- **Missing field** → render nothing for that cell/row (don't render an empty label or a "0"/"N/A" unless the field is explicitly numeric-with-fallback). A `stat_grid` with 3 of 6 items missing should just show 3 cells, reflowed — never empty placeholder cells.
- **Empty array field** (`icon_grid`, `tag_list`, `related_list`) → omit the whole block, including its `section_header`, rather than showing "Abilities" over a blank grid. Wrap header+block pairing at the config level (Section 6) or block level so this stays consistent.
- **Extra/unexpected data fields not referenced by any config section** → simply unused, never an error. The config, not the data shape, drives what renders.
- **Unknown primitive `type` in a config** → skip that section (Section 3), never crash the screen. This lets admin roll out configs slightly ahead of an app release.
- **Malformed config** (missing required prop for a type) → fail at the _admin validation_ layer (Section 8), never at runtime in the app. The app should be able to trust that any config it receives is structurally valid; it only needs to handle _data_ sparseness, not config malformedness.

---

## 6. Config authoring conventions (for the admin website)

- **One config per `gameId + category`.** Every entity (each individual hero, each individual item) reuses the same config — configs describe the _category's_ layout, not per-entity layout. Per-entity variation comes from the data, not a new config.
- **`sections` order in the JSON is exactly render order.** "What to show and in what order" from the admin site is literally reordering/toggling `sections` — no separate ordering field needed.
- **`visible: false` over deletion** for temporary hides — keeps the section's field bindings intact for when it's turned back on, and preserves an audit trail.
- **`section_header` + the block it labels should be adjacent config entries**; if you want header-hides-when-empty behavior (Section 5), pair them as one logical unit in the admin UI (e.g. a "grouped block" author-time concept that emits two sections, or give `icon_grid`/`related_list`/`tag_list` an optional `headerText` prop instead of a separate `section_header` sibling — pick one approach and use it everywhere, don't mix).
- **`connector_annotation` sections reference another section's `id`** via `targetField` — admin UI should only offer image-type section ids as valid targets.
- Keep prop shapes for a given `type` **identical across every game** — e.g. `stat_grid.items[].field` always means the same thing regardless of gameId. Per-game differences live in the _data_ and the _theme tokens_ (`design.md` Section 2), never in per-game prop variants.

---

## 7. Adding a new primitive (rare — resist this)

Before adding one, check: can this be expressed as an existing primitive with a different prop combination (e.g. a "2-column stat comparison" is still `stat_grid` with `columns: 2` and two field sets side by side via two `stat_grid` sections, not a new `comparison_grid` primitive)?

If a genuinely new shape is needed:

1. Add the component to `REGISTRY` with a strict TS prop interface.
2. Document it in the Section 2 table (name, purpose, props) in this file.
3. Version-gate it: bump `schemaVersion` handling so old cached configs referencing older schema versions still render (Section 9), and ensure Section 5's unknown-type fallback covers app versions that predate this primitive.
4. This is the **only** category of change that requires an app store release. Everything else (new game, new category, reshuffled layout, new schema field) should ship via the admin site alone.

---

## 8. Admin-side validation (keep this off the app's plate)

The admin website — not the RN app — is responsible for:

- Validating every `field`/`items[].field` path against that category's known data schema before a config can be published (catch typos/renamed fields at authoring time).
- Enforcing required props per primitive `type` (e.g. `stat_grid` must have non-empty `items`).
- Providing a **live preview** (can reuse the same `SchemaRenderer` + mock/sample data, e.g. via a small RN-Web or Storybook-style preview) so whoever edits a config sees the actual rendered result before publishing — critical since "what to display or not" is now a content decision, not a code decision.
- Config publishing = write + bump a version, never mutate a config in place that a cached app version is relying on mid-session (see Section 9).

---

## 9. Fetching, caching, versioning

- Fetch **layout config** and **entity data** as separate requests/cache lifetimes — layout changes rarely (cache aggressively, e.g. AsyncStorage keyed by `gameId:category:schemaVersion`), data changes more often (cache short-lived or always-fresh depending on your content update cadence).
- On app start / category screen mount: check local cached config version against a lightweight `/config-version?gameId&category` endpoint; refetch only on mismatch.
- `schemaVersion` on the config lets the app apply migration/fallback logic if you ever need it, and lets Section 5's "unknown type" tolerance be paired with "unknown/too-new schemaVersion → show a lightweight 'update the app for full details' notice" instead of a broken render, if a truly new primitive is required.
- Never block the screen entirely on config fetch failure — fall back to last-known-good cached config if the network call fails; only show an error state if there's no cache and no network.

---

## 10. Practical checklist — every time you touch this system

1. Is this change expressible as a **new/edited config** (admin site) rather than a code change? If yes, it shouldn't touch the RN repo at all.
2. If it does need a code change, is it because a **new primitive** is genuinely required (Section 7), not because a config could've been shaped differently?
3. Does the new/changed block handle **missing field**, **empty array**, and **partial data** without special-casing a specific game (Section 5)?
4. Does the block pull all styling from the shared theme (`design.md` tokens/type-scale/spacing), so it automatically reskins per game with zero extra code?
5. Did you update the Section 2 table and TS prop interface in this file if the primitive contract changed?
6. Does an _older_ cached config (previous `schemaVersion`, missing a newer prop) still render sanely with this change?
