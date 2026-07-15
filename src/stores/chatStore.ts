import { atom } from "nanostores";

export const $unreadChatCount = atom<number>(0);
export const $unreadChatCountsMap = atom<Record<string, number>>({});

export function setUnreadChatCount(count: number, countsMap?: Record<string, number>) {
  $unreadChatCount.set(count);
  if (countsMap) {
    $unreadChatCountsMap.set({ ...countsMap });
  }
}
