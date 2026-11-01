import { useRef, useEffect, useState } from 'react';

interface GameMediaProps {
  src: string;
  alt: string;
  className?: string;
}

export function GameMedia({ src, alt, className = '' }: GameMediaProps) {
  const isVideo = src.endsWith('.webm') || src.endsWith('.mp4');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!isVideo || !videoRef.current || failed) return;
    videoRef.current.load();
    videoRef.current.play().catch(() => {});
  }, [isVideo, src, failed]);

  if (isVideo && !failed) {
    return (
      <video
        ref={videoRef}
        key={src}
        autoPlay
        loop
        muted
        playsInline
        disablePictureInPicture
        preload="auto"
        className={className}
        style={{ objectFit: 'cover', display: 'block', minHeight: '100%', minWidth: '100%' }}
        onError={() => setFailed(true)}
        onStalled={() => {
          const el = videoRef.current;
          if (el && el.readyState === 0) {
            setTimeout(() => {
              if (el.readyState === 0) setFailed(true);
            }, 5000);
          }
        }}
      >
        <source src={src} type={src.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
      </video>
    );
  }

  return (
    <img
      src={failed ? src.replace('.webm', '.jpg').replace('.mp4', '.jpg') : src}
      alt={alt}
      className={className}
      onError={(e) => {
        if (failed) {
          (e.target as HTMLImageElement).style.display = 'none';
        }
      }}
    />
  );
}
