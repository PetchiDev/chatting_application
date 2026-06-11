import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAuthStore } from '../store/authStore';
import * as api from '../lib/api';

interface Props {
  onClose: () => void;
}

export function ProfileModal({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overlayRef.current || !modalRef.current) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    gsap.fromTo(modalRef.current, { scale: 0.9, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' });
  }, []);

  const handleClose = () => {
    if (overlayRef.current && modalRef.current) {
      gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
      gsap.to(modalRef.current, {
        scale: 0.9, opacity: 0, duration: 0.2, onComplete: onClose,
      });
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!user?.token) return;
    setSaving(true);
    try {
      const updated = await api.updateProfile(user.token, username);
      setUser(updated);
      handleClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handlePicture = async (file: File) => {
    if (!user?.token) return;
    setSaving(true);
    try {
      const updated = await api.updateProfilePicture(user.token, file);
      setUser(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleClose}>
      <div className="modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h2>Edit Profile</h2>

        <div className="profile-picture-edit">
          <div className="profile-avatar large">
            {user?.profilePictureUrl ? (
              <img src={user.profilePictureUrl} alt="" />
            ) : (
              user?.username[0]?.toUpperCase()
            )}
          </div>
          <label className="upload-label">
            Change photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePicture(file);
              }}
            />
          </label>
        </div>

        <label className="form-label">
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
          />
        </label>

        {user?.isGuest && user.expiresAt && (
          <p className="guest-expiry">
            Guest session expires: {new Date(user.expiresAt).toLocaleString()}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
