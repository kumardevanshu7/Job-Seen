import { useState, useEffect } from "react";
import UserJobsView from "./UserJobsView";

/** 
 * Shell component that reads the username segment from the URL path.
 * Works for static Astro builds with Firebase Hosting SPA rewrites.
 * e.g. /users/devanshu31 → username = "devanshu31"
 */
export default function UserJobsViewShell() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    // Expects /users/<username>
    const user = parts[1] ?? null;
    setUsername(user);
  }, []);

  if (!username) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return <UserJobsView username={username} />;
}
