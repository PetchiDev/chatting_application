import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { ProfileModal } from '../components/ProfileModal';
import { CreateGroupModal } from '../components/CreateGroupModal';
import { CallModal } from '../components/CallModal';
import { useSignalR } from '../hooks/useSignalR';
import { useCall } from '../hooks/useCall';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import type { GroupDto, NotificationDto, UserDto } from '../types';
import * as api from '../lib/api';

export function ChatPage() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const selectUser = useChatStore((s) => s.selectUser);
  const selectGroup = useChatStore((s) => s.selectGroup);
  const selectGlobal = useChatStore((s) => s.selectGlobal);
  const users = useChatStore((s) => s.users);
  const customGroups = useChatStore((s) => s.customGroups);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const selectedGroup = useChatStore((s) => s.selectedGroup);
  const removeCustomGroup = useChatStore((s) => s.removeCustomGroup);

  const [showProfile, setShowProfile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { sendMessage, sendTyping, deleteMessage, forwardMessage } = useSignalR();
  const { activeCall, localStream, remoteStreams, startCall, acceptCall, hangUp } = useCall();
  usePushNotifications();

  const handleSelectUser = (u: UserDto) => {
    selectUser(u);
    setSidebarOpen(false);
  };

  const handleSelectGroup = (group: GroupDto) => {
    selectGroup(group);
    setSidebarOpen(false);
  };

  const handleSelectGlobal = () => {
    selectGlobal();
    setSidebarOpen(false);
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!user?.token) return;
    if (!confirm('Leave this group?')) return;
    try {
      await api.leaveGroup(user.token, groupId);
      removeCustomGroup(groupId);
    } catch {
      alert('Could not leave group');
    }
  };

  const handleGroupCreated = (groupId: string) => {
    const group = useChatStore.getState().customGroups.find((g) => g.id === groupId);
    if (group) selectGroup(group);
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    try {
      if (selectedUser) {
        await startCall(type, { toUserId: selectedUser.id, remoteName: selectedUser.username });
      } else if (selectedGroup) {
        await startCall(type, { groupId: selectedGroup.id, remoteName: selectedGroup.name });
      }
    } catch (err) {
      console.error(err);
      alert(
        err instanceof Error && err.message.includes('not connected')
          ? 'Call service is connecting. Please try again in a moment.'
          : 'Could not start the call. Check camera/mic permissions and try again.'
      );
    }
  };

  const handleNotificationNavigate = (n: NotificationDto) => {
    if (n.channelType === 'dm' && n.channelId) {
      const u = users.find((x) => x.id === n.channelId);
      if (u) selectUser(u);
    } else if (n.channelType === 'group' && n.channelId) {
      const g = customGroups.find((x) => x.id === n.channelId);
      if (g) selectGroup(g);
    } else {
      selectGlobal();
    }
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
        onSelectGlobal={handleSelectGlobal}
        onSelectUser={handleSelectUser}
        onSelectGroup={handleSelectGroup}
        onCreateGroup={() => { setShowCreateGroup(true); setSidebarOpen(false); }}
        onLeaveGroup={handleLeaveGroup}
        onOpenProfile={() => { setShowProfile(true); setSidebarOpen(false); }}
        onLogout={logout}
      />
      <ChatWindow
        sendMessage={sendMessage}
        sendTyping={sendTyping}
        deleteMessage={deleteMessage}
        forwardMessage={forwardMessage}
        onStartCall={handleStartCall}
        onOpenSidebar={() => setSidebarOpen(true)}
        onLogout={logout}
        onNotificationNavigate={handleNotificationNavigate}
      />
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />
      )}
      {activeCall && (
        <CallModal
          call={activeCall}
          localStream={localStream}
          remoteStreams={remoteStreams}
          onAccept={acceptCall}
          onHangUp={hangUp}
        />
      )}
    </div>
  );
}
