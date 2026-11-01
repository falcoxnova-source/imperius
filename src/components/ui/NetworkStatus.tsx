import { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const { t } = useI18n();

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setIsReconnecting(true);
    setTimeout(() => {
      setIsReconnecting(false);
      setShowBanner(false);
      window.location.reload();
    }, 1500);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setShowBanner(true);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  const handleRetry = () => {
    if (navigator.onLine) {
      setIsReconnecting(true);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600/95 backdrop-blur-sm text-white py-3 px-4 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
        {isReconnecting ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">{t.connection.reconnecting}</span>
          </>
        ) : (
          <>
            <WifiOff className="w-5 h-5" />
            <span className="text-sm font-medium">
              {t.connection.connectionLost}
            </span>
            {isOnline && (
              <button
                onClick={handleRetry}
                className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
              >
                {t.connection.retryButton}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
