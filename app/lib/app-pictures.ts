// Pictures as the app loads them (zms content/images.ts toImageUri;
// contract-cases.json "pictures"): the variant it picks from a map of them, a
// path made absolute, and only from the API's own /api/assets or a picture
// host of the contract. The editor's preview, its checks and the data
// validator all follow this.

import { IMAGE_HOSTS, IMAGE_VARIANTS } from "./contract";
import { httpsHost } from "./url-host";

/** Where the app loads pictures from besides /api/assets, and which variant of a map of them it shows. */
export interface PicturePolicy {
  imageHosts: readonly string[];
  imageVariants: readonly string[];
}

/** The contract's picture hosts and variants (the block manifest's must be the same). */
export const CONTRACT_PICTURES: PicturePolicy = { imageHosts: IMAGE_HOSTS, imageVariants: IMAGE_VARIANTS };

/** Block props that show a picture: image, itemImage, backgroundImage, badgeImage (zms model.ts PICTURE_PROP). */
export const PICTURE_PROP = /(^i|I)mage$/;

const ABSOLUTE_URL = /^https?:\/\//;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/**
 * The picture a stored value names: text as it is, or for a map of variants
 * ({ "main": …, "2d": … }) the first of `variants` it holds, else its first
 * text. Undefined when it names none.
 */
export function pickPicture(value: unknown, variants: readonly string[] = IMAGE_VARIANTS): string | undefined {
  if (typeof value === "string") {
    return nonEmpty(value);
  }
  if (!isObject(value)) {
    return undefined;
  }
  return variants.map((key) => nonEmpty(value[key])).find(Boolean) ?? Object.values(value).map(nonEmpty).find(Boolean);
}

/** A picked path as a URL, with `api` as the API's origin; undefined for a path the app doesn't load at all. */
function pictureUrl(path: string, api: string): string | undefined {
  if (path.startsWith("//")) {
    return undefined;
  }
  if (ABSOLUTE_URL.test(path)) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${api}${path}`;
  }
  return path.startsWith("assets/") ? `${api}/api/${path}` : undefined;
}

/** Whether `url` is an https URL on one of `hosts` or a subdomain of one. */
function isOnHosts(url: string, hosts: readonly string[]): boolean {
  const host = httpsHost(url);
  return host !== undefined && hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * The URL the app loads a stored picture from, with `api` as the API's origin
 * (the admin serves /api/assets on its own: ""), or null when it shows nothing.
 * A picked variant the app won't load shows nothing: it doesn't fall back to
 * the next one.
 */
export function appPicture(value: unknown, policy: PicturePolicy = CONTRACT_PICTURES, api = ""): string | null {
  const path = pickPicture(value, policy.imageVariants);
  const url = path === undefined ? undefined : pictureUrl(path, api);
  if (url === undefined) {
    return null;
  }
  return url.startsWith(`${api}/`) || isOnHosts(url, policy.imageHosts) ? url : null;
}

/** The picture a value names that the app won't load; undefined when it names none, or one the app loads. */
export function refusedPicture(value: unknown, policy: PicturePolicy = CONTRACT_PICTURES): string | undefined {
  const picked = pickPicture(value, policy.imageVariants);
  return picked !== undefined && appPicture(value, policy) === null ? picked : undefined;
}

/** What to say about a picture the app won't load. */
export const pictureAdvice = (policy: Pick<PicturePolicy, "imageHosts"> = CONTRACT_PICTURES): string =>
  `use an uploaded picture or one on ${policy.imageHosts.join(", ")}`;

const texts = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "") : undefined;

/** The picture hosts and variants of a block manifest's "$policy", each malformed one replaced by the contract's. */
export function manifestPictures(policy: Record<string, unknown>): { imageHosts: string[]; imageVariants: string[] } {
  const variants = texts(policy.imageVariants) ?? [];
  return {
    imageHosts: texts(policy.imageHosts) ?? [...IMAGE_HOSTS],
    imageVariants: variants.length > 0 ? variants : [...IMAGE_VARIANTS],
  };
}

/** A block manifest's picture hosts, which must be the contract's: the app loads pictures from its own (zms policy.ts IMAGE_HOSTS). */
export function manifestPictureProblems(hosts: unknown): string[] {
  const isSame = Array.isArray(hosts) && hosts.length === IMAGE_HOSTS.length && IMAGE_HOSTS.every((host) => hosts.includes(host));
  return isSame ? [] : [`"$policy.imageHosts" must be the admin's picture hosts (IMAGE_HOSTS in app/lib/contract.ts): ${IMAGE_HOSTS.join(", ")}.`];
}
