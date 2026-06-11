import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { AuthPage } from './pages/AuthPage';
import { ChatPage } from './pages/ChatPage';
import * as api from './lib/api';

export default function App() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!user?.token) return;
    api.getMe(user.token)
      .then(setUser)
      .catch(() => logout());
  }, []);

  return user ? <ChatPage /> : <AuthPage />;
}
