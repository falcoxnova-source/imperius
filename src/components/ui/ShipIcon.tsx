import { Rocket } from 'lucide-react';
import { GameMedia } from './GameMedia';

interface ShipIconProps {
  imageUrl?: string | null;
  name?: string;
  className?: string;
  iconClassName?: string;
}

export function ShipIcon({ imageUrl, name, className = 'w-8 h-8', iconClassName }: ShipIconProps) {
  if (imageUrl) {
    return (
      <GameMedia
        src={imageUrl}
        alt={name || 'Ship'}
        className={`${className} object-contain`}
      />
    );
  }

  return <Rocket className={iconClassName || className} />;
}
