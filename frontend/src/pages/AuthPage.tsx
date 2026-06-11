import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAuthStore } from '../store/authStore';
import * as api from '../lib/api';

type Tab = 'login' | 'register' | 'guest';

const TABS: Tab[] = ['login', 'register', 'guest'];

const TAB_LABELS: Record<Tab, string> = {
  login: 'Login',
  register: 'Register',
  guest: 'Guest',
};

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
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Partial<Record<Tab, HTMLButtonElement>>>({});
  const formPanelRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const isFirstTabRender = useRef(true);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: 'power3.out',
        onComplete: () => {
          if (cardRef.current) gsap.set(cardRef.current, { clearProps: 'transform' });
        },
      }
    );
  }, []);

  const moveIndicator = (activeTab: Tab, animate = true) => {
    const btn = tabButtonRefs.current[activeTab];
    const indicator = indicatorRef.current;
    if (!btn || !indicator) return;

    const { offsetLeft, offsetWidth } = btn;
    const props = { x: offsetLeft, width: offsetWidth };

    if (animate) {
      gsap.to(indicator, { ...props, duration: 0.38, ease: 'power3.out' });
    } else {
      gsap.set(indicator, props);
    }
  };

  useLayoutEffect(() => {
    requestAnimationFrame(() => moveIndicator(tab, false));
  }, []);

  useEffect(() => {
    if (isFirstTabRender.current) {
      isFirstTabRender.current = false;
      return;
    }
    moveIndicator(tab, true);
  }, [tab]);

  useEffect(() => {
    const onResize = () => moveIndicator(tab, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tab]);

  useEffect(() => {
    if (!formPanelRef.current) return;
    gsap.fromTo(
      formPanelRef.current,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.32,
        ease: 'power2.out',
        onComplete: () => {
          if (formPanelRef.current) gsap.set(formPanelRef.current, { clearProps: 'transform' });
        },
      }
    );
  }, [tab]);

  useEffect(() => {
    if (!submitRef.current) return;
    gsap.fromTo(
      submitRef.current,
      { opacity: 0.6, y: 4 },
      { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform' }
    );
  }, [tab]);

  const handleTabChange = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setError('');
  };

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
          <div className="auth-tab-indicator" ref={indicatorRef} aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              ref={(el) => { tabButtonRefs.current[t] = el ?? undefined; }}
              className={tab === t ? 'active' : ''}
              onClick={() => handleTabChange(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-panel" ref={formPanelRef} key={tab}>
            {tab === 'register' && (
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
            )}

            {tab === 'login' && (
              <label>
                Email or Username
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
              </label>
            )}

            {(tab === 'register' || tab === 'guest') && (
              <label>
                Username
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={2} maxLength={30} />
              </label>
            )}

            {tab !== 'guest' && (
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} required minLength={6} />
              </label>
            )}

            {tab === 'guest' && (
              <p className="guest-note">Guest accounts last 24 hours. Username only — no password needed.</p>
            )}
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button ref={submitRef} type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : tab === 'guest' ? 'Join as Guest' : tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
