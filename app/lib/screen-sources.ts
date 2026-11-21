import { getFile, listDirectory, listGames, listSummaries } from "./github";

import type { ScreenSources } from "./screen-loader";

/** The admin API as the screen editor reads it, for one game. */
export function githubSources(game: string): ScreenSources {
  return {
    readFile: (path) => getFile(path),
    listFolder: <T>(folder: string, withContent: boolean) => listDirectory<T>(game, folder, withContent),
    listSummaries: (folder) => listSummaries(game, folder),
    listGames: () => listGames(),
  };
}
