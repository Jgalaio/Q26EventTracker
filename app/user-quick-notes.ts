import { readAppSetting } from "./app-settings";

export type UserQuickNotes = {
  content: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const emptyUserQuickNotes: UserQuickNotes = {
  content: "",
  updatedAt: null,
  updatedBy: null
};

export function userQuickNotesKey(username: string) {
  return `welcome_quick_notes:${encodeURIComponent(username.trim())}`;
}

export async function getUserQuickNotes(username: string) {
  return (await readAppSetting<UserQuickNotes>(userQuickNotesKey(username))) ?? emptyUserQuickNotes;
}
