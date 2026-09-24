/**
 * In-memory per-chat state for conversational bot flows.
 * Tracks whether a chat is in "menu" mode (accepting bare number replies)
 * or "livechat" mode (bot paused, human takes over).
 *
 * ~200 bytes per entry. 10k active chats ≈ 2MB RAM. Negligible.
 */

export type ChatStateType = "menu" | "livechat" | "submenu";

interface ChatState {
    state: ChatStateType;
    menuPath?: string[]; // tracks nesting depth, e.g. ["1", "2"] = inside cmd 1 → sub-cmd 2
    expiresAt: number;
}

const states = new Map<string, ChatState>();

// Cleanup expired states every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, s] of states) {
        if (now >= s.expiresAt) states.delete(key);
    }
}, 5 * 60_000);

/** Key format: `${sessionId}:${remoteJid}` */
export function makeChatKey(sessionId: string, remoteJid: string): string {
    return `${sessionId}:${remoteJid}`;
}

export function setChatState(key: string, state: ChatStateType, expiresAt: number, menuPath?: string[]): void {
    states.set(key, { state, expiresAt, menuPath });
}

export function getChatState(key: string): ChatState | null {
    const s = states.get(key);
    if (!s) return null;
    if (Date.now() >= s.expiresAt) {
        states.delete(key);
        return null;
    }
    return s;
}

export function clearChatState(key: string): void {
    states.delete(key);
}
