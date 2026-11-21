import { BadgePreview } from "../previews/BadgePreview";
import { CoverEntityHeaderPreview } from "../previews/CoverEntityHeaderPreview";
import { DetailHeaderPreview } from "../previews/DetailHeaderPreview";
import { PromoCardPreview } from "../previews/PromoCardPreview";
import { RecordActionsPreview } from "../previews/RecordActionsPreview";
import { ScreenHeaderPreview } from "../previews/ScreenHeaderPreview";
import { TabBarPreview } from "../previews/TabBarPreview";
import { TextPreview } from "../previews/TextPreview";
import { WelcomeBannerPreview } from "../previews/WelcomeBannerPreview";

import type { PreviewProps } from "../types";
import type { ComponentType } from "react";

/** The previews of headers, cards and single values, by block type. */
export const HEADER_PREVIEWS: Partial<Record<string, ComponentType<PreviewProps>>> = {
  screen_header: ScreenHeaderPreview,
  welcome_banner: WelcomeBannerPreview,
  record_actions: RecordActionsPreview,
  promo_card: PromoCardPreview,
  detail_header: DetailHeaderPreview,
  tab_bar: TabBarPreview,
  text: TextPreview,
  badge: BadgePreview,
  cover_entity_header: CoverEntityHeaderPreview,
};
