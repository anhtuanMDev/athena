import {
  type RouteConfig,
  layout,
  route,
  index,
  prefix,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  layout("routes/_admin.tsx", [
    route("dashboard", "routes/_admin.dashboard.tsx"),
    route("activity", "routes/_admin.activity.tsx"),

    route("games", "routes/_admin.games.tsx"),
    route("games/new", "routes/_admin.games.new.tsx"),
    route("games/:slug/edit", "routes/_admin.games.$slug.edit.tsx"),

    route(":game/schema", "routes/_admin.$game.schema.tsx"),

    ...prefix(":game/heroes", [
      index("routes/_admin.$game.heroes._index.tsx"),
      route("new", "routes/_admin.$game.heroes.new.tsx"),
      route(":id", "routes/_admin.$game.heroes.$id.tsx"),
      route(":id/delete", "routes/_admin.$game.heroes.$id.delete.tsx"),
    ]),

    ...prefix(":game/maps", [
      index("routes/_admin.$game.maps._index.tsx"),
      route("new", "routes/_admin.$game.maps.new.tsx"),
      route(":id", "routes/_admin.$game.maps.$id.tsx"),
    ]),

    ...prefix(":game/modes", [
      index("routes/_admin.$game.modes._index.tsx"),
      route("new", "routes/_admin.$game.modes.new.tsx"),
      route(":id", "routes/_admin.$game.modes.$id.tsx"),
    ]),

    ...prefix(":game/patches", [
      index("routes/_admin.$game.patches._index.tsx"),
      route("new", "routes/_admin.$game.patches.new.tsx"),
      route(":id", "routes/_admin.$game.patches.$id.tsx"),
    ]),

    route(":game/raw/:type/:id", "routes/_admin.$game.raw.$type.$id.tsx"),
  ]),
] satisfies RouteConfig;
