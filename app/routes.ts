import {
  type RouteConfig,
  layout,
  route,
  index,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  layout("routes/_admin.tsx", [
    route("dashboard", "routes/_admin.dashboard.tsx"),
    route("activity", "routes/_admin.activity.tsx"),

    route("games", "routes/_admin.games.tsx"),

    route(":game/*", "routes/_admin.$game.tsx"),
  ]),
] satisfies RouteConfig;
