import { useEffect } from "react";
import { useNavigate } from "react-router";
import { logout as authLogout } from "~/lib/auth";

export default function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    authLogout().then(() => navigate("/login"));
  }, [navigate]);

  return <div>Logging out...</div>;
}
