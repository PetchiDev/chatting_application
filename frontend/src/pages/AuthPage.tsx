import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAuthStore } from '../store/authStore';
import * as api from '../lib/api';

type Tab = 'login' | 'register' | 'guest';

export function AuthPage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 40, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let authUser;
      if (tab === 'register') {
        authUser = await api.register(email, username, password);
      } else if (tab === 'login') {
        authUser = await api.login(identifier, password);
      } else {
        authUser = await api.guestLogin(username);
      }
      setUser(authUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" ref={cardRef}>
        <div className="auth-logo">
          <div className="auth-logo-frame">
            <img src="/kryptos-logo.png" alt="Kryptos" className="auth-logo-img" />
          </div>
          <h1>Kryptos <span>Chat</span></h1>
          <p>Real-time chat that resets every 24 hours</p>
        </div>

        <div className="auth-tabs">
          {(['login', 'register', 'guest'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'active' : ''}
              onClick={() => { setTab(t); setError(''); }}
            >
              {t === 'login' ? 'Login' : t === 'register' ? 'Register' : 'Guest'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === 'register' && (
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          )}

          {tab === 'login' && (
            <label>
              Email or Username
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </label>
          )}

          {(tab === 'register' || tab === 'guest') && (
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={30} />
            </label>
          )}

          {tab !== 'guest' && (
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
          )}

          {tab === 'guest' && (
            <p className="guest-note">Guest accounts last 24 hours. Username only — no password needed.</p>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : tab === 'guest' ? 'Join as Guest' : tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
