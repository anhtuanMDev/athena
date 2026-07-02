import { redirect, useActionData, Form, data } from "react-router";
import type { Route } from "./+types/login";
import { login, createAdminSession, getAdminSession, SESSION_KEY } from "~/lib/session.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { checkRateLimit, getClientIp, recordAttempt } from "~/lib/rate-limit.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getAdminSession(request);
  if (session.get(SESSION_KEY)) {
    throw redirect("/dashboard");
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = formData.get("password") as string;

  const ip = getClientIp(request);
  const { allowed, retryAfter } = checkRateLimit(ip);
  if (!allowed) {
    return data(
      { error: `Too many attempts. Try again in ${retryAfter} seconds.` },
      { status: 429 },
    );
  }

  if (!password || !(await login(password))) {
    recordAttempt(ip, false);
    return data({ error: "Invalid password" }, { status: 401 });
  }

  recordAttempt(ip, true);
  const cookie = await createAdminSession(request);
  return redirect("/dashboard", { headers: { "Set-Cookie": cookie } });
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Login</h1>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoFocus
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            {actionData?.error && (
              <p className="text-sm text-red-500">{actionData.error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Sign in
            </button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
