import { redirect } from "react-router";
import type { Route } from "./+types/home";

export async function loader() {
  throw redirect("/dashboard");
}

export default function Home() {
  return null;
}
