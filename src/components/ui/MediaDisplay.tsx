import { type ReactNode, useState, useRef, useEffect } from 'react';

interface MediaDisplayProps {
  src: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
}

function isVideoUrl(url: string): boolean {
  return url.endsWith('.webm') || url.endsWith('.mp4');
}

function VideoPlayer({ src, className, alt }: { src: string; className?: string; alt?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || failed) return;

    el.load();
    const playPromise = el.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
  }, [src, failed]);

  if (failed) {
    return (
      <div className={`${className || ''} flex items-center justify-center bg-space-800`}>
        <img
          src={src.replace('.webm', '.jpg').replace('.mp4', '.jpg')}
          alt={alt || ''}
          className={className}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      key={src}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      preload="auto"
      onError={() => setFailed(true)}
      onStalled={() => {
        const el = videoRef.current;
        if (el && el.readyState === 0) {
          setTimeout(() => {
            if (el.readyState === 0) setFailed(true);
          }, 5000);
        }
      }}
      style={{ objectFit: 'cover' }}
    >
      <source src={src} type={src.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
    </video>
  );
}

export function MediaDisplay({ src, alt, className, fallback }: MediaDisplayProps) {
  if (!src) {
    return fallback ? <>{fallback}</> : null;
  }

  if (isVideoUrl(src)) {
    return <VideoPlayer src={src} className={className} alt={alt} />;
  }

  return <img src={src} alt={alt || ''} className={className} />;
}
