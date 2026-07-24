import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { $unreadChatCountsMap } from "../../stores/chatStore";
import {
  getConnectedUIDs, getUsersByUIDs,
  getChatId, sendMessage, subscribeToMessages, markMessagesRead,
} from "../../lib/firestore";
import type { UserProfile, ChatMessage } from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: any): string {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupMessagesByDay(msgs: ChatMessage[]) {
  const groups: { label: string; msgs: ChatMessage[] }[] = [];
  let lastLabel = "";
  msgs.forEach(m => {
    const d = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const label =
      d.toDateString() === now.toDateString() ? "Today" :
      d.toDateString() === yesterday.toDateString() ? "Yesterday" :
      d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (label !== lastLabel) { groups.push({ label, msgs: [] }); lastLabel = label; }
    groups[groups.length - 1].msgs.push(m);
  });
  return groups;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatView() {
  const auth = useStore($auth);
  const unreadMap = useStore($unreadChatCountsMap);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const QUICK_EMOJIS = ["😀", "😂", "🤣", "😊", "😍", "😘", "😜", "😎", "😏", "😒", "😔", "😢", "😭", "😡", "🤯", "🥶", "🤔", "🤗", "🤫"];
  const [sending, setSending] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      const uids = await getConnectedUIDs(auth.user!.uid);
      const users = await getUsersByUIDs(uids);
      setContacts(users);
      setLoadingContacts(false);
    })();
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user || !activeUser) return;
    const unsub = subscribeToMessages(auth.user.uid, activeUser.uid, msgs => {
      setMessages(msgs);
      markMessagesRead(auth.user!.uid, activeUser.uid, auth.user!.uid).catch(() => {});
    });
    return () => unsub();
  }, [activeUser, auth.user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!auth.user || !auth.profile || !activeUser || !text.trim()) return;
    setSending(true);
    try {
      await sendMessage(auth.user.uid, activeUser.uid, auth.profile.username, text);
      setText("");
      setShowPicker(false);
      inputRef.current?.focus();
    } catch {
      showToast("Failed to send message.", "error");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const grouped = groupMessagesByDay(messages);

  // Mobile: show list OR chat. Desktop: show both.
  const showList = !isMobile || !activeUser;
  const showChat = !isMobile || !!activeUser;

  // ── Contact List ──────────────────────────────────────────────────────────
  const ContactList = (
    <div style={{
      width: isMobile ? "100%" : 260,
      flexShrink: 0,
      borderRight: isMobile ? "none" : "1.5px solid var(--hairline)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      height: "100%",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--hairline)",
        fontSize: 11, fontWeight: 700, color: "var(--mute)", letterSpacing: "0.06em",
      }}>
        CONNECTIONS
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loadingContacts ? (
          <div style={{ padding: "8px 0" }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                <div className="shimmer-bg" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="shimmer-bg shimmer-line" style={{ height: 14, width: "62%", marginBottom: 8 }} />
                  <div className="shimmer-bg shimmer-line" style={{ height: 10, width: "38%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: "var(--mute)" }}>
            No connections yet.
          </div>
        ) : contacts.map(c => {
          const isActive = activeUser?.uid === c.uid;
          return (
            <button key={c.uid} onClick={() => setActiveUser(c)} style={{
              width: "100%", textAlign: "left",
              padding: "12px 16px",
              background: isActive ? "var(--hairline)" : "transparent",
              border: "none", borderBottom: "1px solid var(--hairline)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
              fontFamily: "inherit", transition: "background 0.1s",
            }}>
              {c.photoURL && (
                <img 
                  src={c.photoURL} 
                  alt="avatar" 
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as any).style.display = 'flex'; }}
                  style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} 
                />
              )}
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "var(--ink)", color: "var(--canvas)",
                alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, flexShrink: 0,
                display: c.photoURL ? 'none' : 'flex'
              }}>
                {c.displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{c.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--mute)" }}>@{c.username}</div>
              </div>
              {auth.user && unreadMap[getChatId(auth.user.uid, c.uid)] > 0 && (
                <div style={{
                  marginLeft: "auto",
                  background: "#e74c3c", color: "#fff",
                  fontSize: 10, fontWeight: 700,
                  width: 20, height: 20, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {unreadMap[getChatId(auth.user.uid, c.uid)]}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Chat Window ───────────────────────────────────────────────────────────
  const ChatWindow = activeUser ? (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--canvas)", flexShrink: 0,
      }}>
        {/* Back button on mobile */}
        {isMobile && (
          <button onClick={() => setActiveUser(null)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "4px 8px 4px 0", color: "var(--ink)", display: "flex",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        {activeUser.photoURL && (
          <img 
            src={activeUser.photoURL} 
            alt="avatar" 
            referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as any).style.display = 'flex'; }}
            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} 
          />
        )}
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "var(--ink)", color: "var(--canvas)",
          alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0,
          display: activeUser.photoURL ? 'none' : 'flex'
        }}>
          {activeUser.displayName?.[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{activeUser.displayName}</div>
          <div style={{ fontSize: 11, color: "var(--mute)" }}>@{activeUser.username}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, display: "block", margin: "0 auto 10px" }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            Start the conversation!
          </div>
        )}

        {grouped.map(group => (
          <div key={group.label}>
            {/* Day divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
              <span style={{ fontSize: 11, color: "var(--mute)", fontWeight: 600, whiteSpace: "nowrap" }}>{group.label}</span>
              <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
            </div>

            {group.msgs.map((msg, i) => {
              const isMine = msg.senderUID === auth.user?.uid;
              const sameAsPrev = group.msgs[i - 1]?.senderUID === msg.senderUID;
              return (
                <div key={msg.id} style={{
                  display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  marginTop: sameAsPrev ? 2 : 10,
                }}>
                  <div style={{
                    maxWidth: "75%",
                    background: isMine ? "var(--ink)" : "var(--hairline)",
                    color: isMine ? "var(--canvas)" : "var(--ink)",
                    borderRadius: isMine
                      ? (sameAsPrev ? "16px 4px 4px 16px" : "16px 4px 16px 16px")
                      : (sameAsPrev ? "4px 16px 16px 4px" : "4px 16px 16px 16px"),
                    padding: "9px 13px",
                    fontSize: 14,
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}>
                    <div>{msg.text}</div>
                    <div style={{
                      fontSize: 10, marginTop: 3,
                      color: isMine ? "rgba(255,255,255,0.45)" : "var(--mute)",
                      textAlign: "right", display: "flex", alignItems: "center",
                      justifyContent: "flex-end", gap: 3,
                    }}>
                      {formatTime(msg.createdAt)}
                      {isMine && (
                        msg.read
                          ? /* Green tick — seen */
                            <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                              <path d="M1 5l3.5 4L12 1" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          : /* Faint white tick — sent */
                            <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                              <path d="M1 5l3.5 4L12 1" stroke="rgba(255,255,255,0.35)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--hairline)",
        display: "flex", gap: 8, alignItems: "flex-end",
        background: "var(--canvas)", flexShrink: 0,
      }}>
        <style>{`
          .chat-input::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowPicker(!showPicker)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 20, padding: 0, paddingBottom: 6,
              color: "var(--mute)"
            }}
          >
            😀
          </button>
          {showPicker && (
            <div style={{
              position: "absolute", bottom: "100%", left: 0, marginBottom: 12, zIndex: 10,
              background: "var(--canvas)", border: "1px solid var(--hairline)", borderRadius: 12,
              padding: 10, width: 220, display: "flex", flexWrap: "wrap", gap: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
            }}>
              {QUICK_EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => {
                    setText(prev => prev + em);
                    inputRef.current?.focus();
                  }}
                  style={{
                    background: "none", border: "none", fontSize: 22, cursor: "pointer",
                    padding: 4, borderRadius: 6, transition: "background 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = "var(--hairline)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "none"}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${activeUser.displayName}...`}
          rows={1}
          style={{
            flex: 1, resize: "none",
            border: "1.5px solid var(--hairline)",
            borderRadius: 20, padding: "9px 14px",
            fontSize: 14, fontFamily: "inherit",
            background: "var(--canvas)", color: "var(--ink)",
            outline: "none", lineHeight: 1.4,
            maxHeight: 100, overflowY: "auto",
            scrollbarWidth: "none", // Firefox
          }}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 100) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: text.trim() ? "var(--ink)" : "var(--hairline)",
            border: "none", cursor: text.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={text.trim() ? "var(--canvas)" : "var(--mute)"}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "var(--mute)" }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
      <span style={{ fontSize: 14 }}>Select a connection to start chatting</span>
    </div>
  );

  return (
    <>
      <ToastProvider />
      <div className="page-header">
        <h1 className="page-title">Messages</h1>
      </div>

      <div style={{
        display: "flex",
        height: "calc(100vh - 140px)",
        border: "1.5px solid var(--hairline)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--canvas)",
      }}>
        {showList && ContactList}
        {showChat && ChatWindow}
      </div>
    </>
  );
}
