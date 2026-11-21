import { FeaturedCarouselPreview } from "../previews/FeaturedCarouselPreview";
import { FieldSectionPreview } from "../previews/FieldSectionPreview";
import { FilterChipsPreview } from "../previews/FilterChipsPreview";
import { InfoListPreview } from "../previews/InfoListPreview";
import { ItemListPreview } from "../previews/ItemListPreview";
import { ItemsPreview } from "../previews/ItemsPreview";
import { RecordGridPreview } from "../previews/RecordGridPreview";
import { ShortcutGridPreview } from "../previews/ShortcutGridPreview";
import { StatRowPreview } from "../previews/StatRowPreview";

import type { PreviewProps } from "../types";
import type { ComponentType } from "react";

/** The previews of lists, records and fields, by block type. */
export const LIST_PREVIEWS: Partial<Record<string, ComponentType<PreviewProps>>> = {
  featured_carousel: FeaturedCarouselPreview,
  shortcut_grid: ShortcutGridPreview,
  filter_chips: FilterChipsPreview,
  record_grid: RecordGridPreview,
  info_list: InfoListPreview,
  field_section: FieldSectionPreview,
  route_timeline: ItemsPreview,
  gallery: ItemsPreview,
  tips_card: ItemsPreview,
  item_list: ItemListPreview,
  stat_row: StatRowPreview,
};
