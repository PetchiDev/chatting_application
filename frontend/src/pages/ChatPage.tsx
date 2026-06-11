import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { ProfileModal } from '../components/ProfileModal';
import { useSignalR } from '../hooks/useSignalR';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import type { UserDto } from '../types';

export function ChatPage() {
  const logout = useAuthStore((s) => s.logout);
  const selectUser = useChatStore((s) => s.selectUser);
  const [showProfile, setShowProfile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { sendMessage, sendTyping, deleteMessage } = useSignalR();

  const handleSelectUser = (user: UserDto | null) => {
    selectUser(user);
    setSidebarOpen(false);
  };

  return (
    <div className="chat-layout">
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectUser={handleSelectUser}
        onOpenProfile={() => { setShowProfile(true); setSidebarOpen(false); }}
        onLogout={logout}
      />
      <ChatWindow
        sendMessage={sendMessage}
        sendTyping={sendTyping}
        deleteMessage={deleteMessage}
        onOpenSidebar={() => setSidebarOpen(true)}
        onLogout={logout}
      />
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
