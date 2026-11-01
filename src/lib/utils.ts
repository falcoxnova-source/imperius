// Utilidades generales del juego

// Formatear numeros grandes
export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toLocaleString('es-ES');
}

// Formatear tasa de recursos por hora
export function formatResourceRate(rate: number): string {
  if (rate >= 1_000_000) {
    return (rate / 1_000_000).toFixed(1) + 'M';
  }
  if (rate >= 1_000) {
    return (rate / 1_000).toFixed(1) + 'K';
  }
  return rate.toLocaleString('es-ES');
}

// Formatear tiempo en formato legible
export function formatTime(seconds: number): string {
  if (seconds < 0) return '00:00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

// Formatear tiempo restante desde una fecha
export function formatTimeRemaining(endDate: string | Date): string {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const remaining = Math.max(0, (end - now) / 1000);
  return formatTime(remaining);
}

// Formatear coordenadas
export function formatCoordinates(galaxy: number, system: number, position: number): string {
  return `[${galaxy}:${system}:${position}]`;
}

// Formatear fecha relativa
export function formatRelativeDate(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `hace ${days} dia${days > 1 ? 's' : ''}`;
  if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return 'hace unos segundos';
}

// Calcular porcentaje
export function calculatePercent(value: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(100, (value / max) * 100);
}

// Generar ID unico
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Validar email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validar nombre de usuario
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

// Clase condicional helper
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function getPlanetImage(tempMax: number, imageId: number = 1): string {
  const hotPlanets = [
    'https://images.pexels.com/photos/73910/mars-mars-rover-space-travel-robot-73910.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/3697742/pexels-photo-3697742.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/4666748/pexels-photo-4666748.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/816608/pexels-photo-816608.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/2098428/pexels-photo-2098428.jpeg?auto=compress&cs=tinysrgb&w=400',
  ];

  const temperatePlanets = [
    'https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/41953/earth-blue-planet-globe-planet-41953.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/614484/pexels-photo-614484.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/2156/sky-earth-space-working.jpg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/220201/pexels-photo-220201.jpeg?auto=compress&cs=tinysrgb&w=400',
  ];

  const coldPlanets = [
    'https://images.pexels.com/photos/39561/solar-flare-sun-eruption-energy-39561.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/1341279/pexels-photo-1341279.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/1169754/pexels-photo-1169754.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/355863/pexels-photo-355863.jpeg?auto=compress&cs=tinysrgb&w=400',
    'https://images.pexels.com/photos/2098427/pexels-photo-2098427.jpeg?auto=compress&cs=tinysrgb&w=400',
  ];

  let selectedImages: string[];

  if (tempMax > 100) {
    selectedImages = hotPlanets;
  } else if (tempMax < 0) {
    selectedImages = coldPlanets;
  } else {
    selectedImages = temperatePlanets;
  }

  return selectedImages[(imageId - 1) % selectedImages.length];
}

// Iconos de recursos
export const resourceIcons = {
  metal: '⚙️',
  crystal: '💎',
  deuterium: '⚡',
  energy: '☀️',
  darkMatter: '🌑',
};

// Colores de recursos
export const resourceColors = {
  metal: 'text-gray-400',
  crystal: 'text-cyan-400',
  deuterium: 'text-green-400',
  energy: 'text-yellow-400',
  darkMatter: 'text-purple-400',
};
