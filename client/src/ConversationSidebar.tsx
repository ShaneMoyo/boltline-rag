import type { ConversationListItem } from "./conversationTypes.ts";

type ConversationSidebarProps = {
  items: ConversationListItem[];
  activeId: string | null;
  loading: boolean;
  openMobile: boolean;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
};

function formatUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      d
    );
  } catch {
    return "";
  }
}

export default function ConversationSidebar({
  items,
  activeId,
  loading,
  openMobile,
  onToggleMobile,
  onCloseMobile,
  onSelect,
  onNewChat,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle btn"
        aria-expanded={openMobile}
        aria-controls="conversation-sidebar"
        onClick={onToggleMobile}
      >
        Chats
      </button>
      <aside
        id="conversation-sidebar"
        className={`sidebar${openMobile ? " sidebar-open" : ""}`}
        aria-label="Conversations"
      >
        <div className="sidebar-head">
          <h2 className="sidebar-title">Chats</h2>
          <button type="button" className="btn btn-small primary" onClick={onNewChat}>
            New chat
          </button>
        </div>
        {loading ? (
          <p className="sidebar-hint">Loading…</p>
        ) : items.length === 0 ? (
          <p className="sidebar-hint">No saved chats yet. Ask a question to start.</p>
        ) : (
          <ul className="sidebar-list">
            {items.map((item) => (
              <li key={item.id}>
                <div
                  className={`sidebar-item${item.id === activeId ? " sidebar-item-active" : ""}`}
                >
                  <button
                    type="button"
                    className="sidebar-item-main"
                    onClick={() => {
                      onSelect(item.id);
                      onCloseMobile();
                    }}
                  >
                    <span className="sidebar-item-title">{item.title}</span>
                    <span className="sidebar-item-meta">{formatUpdated(item.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-item-delete"
                    title="Delete chat"
                    aria-label={`Delete ${item.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {openMobile ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close chat list"
          onClick={onToggleMobile}
        />
      ) : null}
    </>
  );
}
