import { useEffect, useState } from "react";
import { onAuthChanged, getUserProfile, hasAdminClaim } from "../../lib/auth";
import { $auth, setAuthState } from "../../stores/authStore";
import { subscribeToNotifications, getConnectedUIDs, subscribeToUnreadChatCount } from "../../lib/firestore";
import { setNotifications } from "../../stores/notificationStore";
import { setUnreadChatCount } from "../../stores/chatStore";
import UsernameSetup from "./UsernameSetup";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function AuthProvider({ children, requireAdmin = false }: Props) {
  const cached = $auth.get();
  const [state, setState] = useState({
    loading: !(cached.initialized && cached.user && cached.profile),
    needsUsername: false,
    notAdmin: false,
    loadError: false,
  });

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let unsubscribeNotifications: (() => void) | null = null;
    let unsubscribeChats: (() => void)[] = [];

    const clearLiveData = () => {
      unsubscribeNotifications?.();
      unsubscribeNotifications = null;
      unsubscribeChats.forEach(unsubscribe => unsubscribe());
      unsubscribeChats = [];
      setNotifications([]);
      setUnreadChatCount(0, {});
    };

    const unsubscribeAuth = onAuthChanged(async user => {
      const currentGeneration = ++generation;
      clearLiveData();

      if (!user) {
        setAuthState({ user: null, profile: null, isAdmin: false, loading: false, initialized: true });
        setState({ loading: false, needsUsername: false, notAdmin: false, loadError: false });
        window.location.href = "/login";
        return;
      }

      try {
        const [admin, profile] = await Promise.all([
          hasAdminClaim(user),
          getUserProfile(user.uid),
        ]);
        if (disposed || currentGeneration !== generation) return;

        if (requireAdmin && !admin) {
          setAuthState({ user, profile: null, isAdmin: false, loading: false, initialized: true });
          setState({ loading: false, needsUsername: false, notAdmin: true, loadError: false });
          return;
        }

        if (!profile?.username) {
          setAuthState({ user, profile: null, isAdmin: admin, loading: false, initialized: true });
          setState({ loading: false, needsUsername: true, notAdmin: false, loadError: false });
          return;
        }

        setAuthState({ user, profile, isAdmin: admin, loading: false, initialized: true });
        setState({ loading: false, needsUsername: false, notAdmin: false, loadError: false });
        unsubscribeNotifications = subscribeToNotifications(user.uid, setNotifications);

        const connectedUIDs = await getConnectedUIDs(user.uid);
        if (disposed || currentGeneration !== generation) {
          unsubscribeNotifications?.();
          return;
        }
        unsubscribeChats = subscribeToUnreadChatCount(user.uid, connectedUIDs, setUnreadChatCount);
      } catch (err) {
        if (disposed || currentGeneration !== generation) return;
        // Never silently render the app with a null profile — surface the failure instead.
        console.error("AuthProvider: failed to load user profile/admin claim", err);
        setAuthState({ user, profile: null, isAdmin: false, loading: false, initialized: true });
        setState({ loading: false, needsUsername: false, notAdmin: false, loadError: true });
      }
    });

    return () => {
      disposed = true;
      generation += 1;
      unsubscribeAuth();
      clearLiveData();
    };
  }, [requireAdmin]);

  if (state.loading) return <ShimmerSkeleton variant="auth" />;

  if (state.loadError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: 16 }}>
        <h2 style={{ color: "var(--error)", margin: 0 }}>Couldn't load your account</h2>
        <p style={{ color: "var(--text-secondary)" }}>Check your internet connection and try again.</p>
        <button className="btn btn-ghost" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
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

  if (state.needsUsername) return <UsernameSetup />;
  return <>{children}</>;
}
