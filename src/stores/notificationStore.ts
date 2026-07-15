import { atom } from "nanostores";
import type { Notification } from "../lib/firestore";

export const $notifications = atom<Notification[]>([]);

export function setNotifications(notifs: Notification[]) {
  $notifications.set(notifs);
}

export function unreadCount(): number {
  return $notifications.get().filter((n) => n.status === "unread").length;
}
