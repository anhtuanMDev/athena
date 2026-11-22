import { handleGetAsset } from "./assets";
import { handleCheck, handleLogin, handleLogout } from "./auth";
import { handleDeleteFile, handleGetFile, handleWriteFile } from "./files";
import { handleGameIcon, handleSaveGames } from "./game-routes";
import { STATUS, json } from "./http";
import { handleImport } from "./imports";
import { handleCommits, handleDashboardData, handleGetEnum, handleListDirectory, handleListFolders, handleListGames } from "./listings";
import { handleDeleteRecord, handlePruneAssets, handleRecordAssets } from "./record-files";
import { handleSaveRecord, handleUploadPicture } from "./records";
import { handleGithubStatus, handlePushStatus } from "./status";

import type { ApiContext } from "./env";

// The admin API's routes, as the admin calls them, matched in this order: the first
// whose method and path match answers.

/** A route's handler: the request, and its path after /api/. */
type Handler = (context: ApiContext, path: string) => Promise<Response>;

interface Route {
  method: string;
  matches: (path: string) => boolean;
  handle: Handler;
}

const API = "/api/";

/** One file of the data repository: read, written or deleted. */
const DATA_FILE = "/api/data/file";

const ENUM_ROUTE = /^([^/]+)\/enums\/([^/]+)$/;

function exact(method: string, route: string, handle: Handler): Route {
  return { method, matches: (path) => `${API}${path}` === route, handle };
}

function prefixed(method: string, prefix: string, handle: Handler): Route {
  return { method, matches: (path) => `${API}${path}`.startsWith(prefix), handle };
}

async function enumRoute(context: ApiContext, path: string): Promise<Response> {
  const [, game, enumId] = ENUM_ROUTE.exec(path) ?? [];
  return handleGetEnum(context, { game, enumId });
}

const ROUTES: Route[] = [
  exact("POST", "/api/auth/login", handleLogin),
  exact("POST", "/api/auth/logout", handleLogout),
  exact("GET", "/api/auth/check", handleCheck),
  exact("GET", DATA_FILE, handleGetFile),
  exact("POST", DATA_FILE, handleWriteFile),
  exact("DELETE", DATA_FILE, handleDeleteFile),
  exact("POST", "/api/data/picture", handleUploadPicture),
  exact("POST", "/api/data/save-record", handleSaveRecord),
  exact("POST", "/api/data/game-icon", handleGameIcon),
  exact("POST", "/api/data/save-games", handleSaveGames),
  exact("GET", "/api/data/record-assets", handleRecordAssets),
  exact("POST", "/api/data/delete-record", handleDeleteRecord),
  exact("POST", "/api/data/prune-assets", handlePruneAssets),
  exact("GET", "/api/data/directory", handleListDirectory),
  exact("GET", "/api/data/folders", handleListFolders),
  exact("GET", "/api/data/games", handleListGames),
  exact("GET", "/api/data/dashboard", handleDashboardData),
  exact("GET", "/api/data/commits", handleCommits),
  prefixed("GET", "/api/assets/", handleGetAsset),
  prefixed("POST", "/api/imports/", async (context, path) => handleImport(context, path.slice("imports/".length))),
  exact("GET", "/api/push/status", handlePushStatus),
  exact("GET", "/api/github/status", handleGithubStatus),
  { method: "GET", matches: (path) => ENUM_ROUTE.test(path), handle: enumRoute },
];

/** The route a request asks for, by its method and its path after /api/. */
export function routeOf(method: string, path: string): Handler | undefined {
  return ROUTES.find((route) => route.method === method && route.matches(path))?.handle;
}

export function notFound(): Response {
  return json({ error: "Not found" }, STATUS.notFound);
}
