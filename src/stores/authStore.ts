import { atom, task } from "nanostores";
import type { User } from "firebase/auth";
import type { UserProfile } from "../lib/firestore";

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  initialized: boolean;
}

export const $auth = atom<AuthState>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  initialized: false,
});

export function setAuthState(state: Partial<AuthState>) {
  $auth.set({ ...$auth.get(), ...state });
}
