import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { destroyAdminSession } from "~/lib/session.server";

export async function action({ request }: Route.ActionArgs) {
  const cookie = await destroyAdminSession(request);
  throw redirect("/login", { headers: { "Set-Cookie": cookie } });
}

export async function loader() {
  throw redirect("/login");
}
