import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  isOwn?: boolean;
}

const BAR_COUNT = 18;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioMessage({ src, isOwn }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(audio.duration);
      setReady(Number.isFinite(audio.duration));
    };
    const onTime = () => setCurrent(audio.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        /* playback blocked or unsupported */
      }
    }
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={`msg-audio-wrap ${isOwn ? 'own' : ''}`}>
      <audio ref={audioRef} src={src} preload="metadata">
        <track kind="captions" />
      </audio>
      <button type="button" className="msg-audio-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="msg-audio-body">
        <div className="msg-audio-bars" aria-hidden="true">
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              key={i}
              className={playing && i / BAR_COUNT <= progress / 100 ? 'active' : ''}
              style={{ height: `${30 + ((i * 7) % 55)}%` }}
            />
          ))}
        </div>
        <div className="msg-audio-meta">
          <div className="msg-audio-track">
            <div className="msg-audio-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="msg-audio-time">
            {formatTime(playing || current > 0 ? current : duration)}
            {ready && !playing && current === 0 ? '' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
