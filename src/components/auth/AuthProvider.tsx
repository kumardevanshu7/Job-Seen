import { useEffect, useState } from "react";
import { onAuthChanged, getUserProfile, isAdmin } from "../../lib/auth";
import { $auth, setAuthState } from "../../stores/authStore";
import { subscribeToNotifications, getConnectedUIDs, subscribeToUnreadChatCount } from "../../lib/firestore";
import { setNotifications } from "../../stores/notificationStore";
import { setUnreadChatCount } from "../../stores/chatStore";
import type { UserProfile } from "../../lib/firestore";
import UsernameSetup from "./UsernameSetup";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function AuthProvider({ children, requireAdmin = false }: Props) {
  const cached = $auth.get();
  const [state, setState] = useState({
    // Client-side nav remounts this island — reuse store so spinner na dikhe
    loading: !(cached.initialized && cached.user && cached.profile),
    needsUsername: false,
    notAdmin: false,
  });

  useEffect(() => {
    const unsub = onAuthChanged(async (user) => {
      if (!user) {
        setAuthState({ user: null, profile: null, loading: false, initialized: true });
        setState({ loading: false, needsUsername: false, notAdmin: false });
        window.location.href = "/login";
        return;
      }

      if (requireAdmin && !isAdmin(user.uid)) {
        setState({ loading: false, needsUsername: false, notAdmin: true });
        return;
      }

      const profile = await getUserProfile(user.uid) as UserProfile | null;

      if (!profile || !profile.username) {
        setAuthState({ user, profile: null, loading: false, initialized: true });
        setState({ loading: false, needsUsername: true, notAdmin: false });
        return;
      }

      setAuthState({ user, profile: { ...profile, uid: user.uid } as UserProfile, loading: false, initialized: true });
      setState({ loading: false, needsUsername: false, notAdmin: false });

      const unsubNotif = subscribeToNotifications(user.uid, setNotifications);

      let unsubsChat: (() => void)[] = [];
      getConnectedUIDs(user.uid).then(uids => {
        unsubsChat = subscribeToUnreadChatCount(user.uid, uids, setUnreadChatCount);
      });

      return () => {
        unsubNotif();
        unsubsChat.forEach(u => u());
      };
    });

    return () => unsub();
  }, [requireAdmin]);

  if (state.loading) {
    return <ShimmerSkeleton variant="auth" />;
  }

  if (state.notAdmin) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: 16 }}>
        <h2 style={{ color: "var(--error)", margin: 0 }}>Access Denied</h2>
        <p style={{ color: "var(--text-secondary)" }}>You don't have permission to view this page.</p>
        <a href="/" className="btn btn-ghost">Go Home</a>
      </div>
    );
  }

  if (state.needsUsername) {
    return <UsernameSetup />;
  }

  return <>{children}</>;
}
