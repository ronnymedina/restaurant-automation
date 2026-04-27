import { useEffect, useRef, useState } from 'react';

interface SseConnectionProps {
  url: string;
  events: string[];
  onEvent: (event: string, data: unknown) => void;
  onConnect?: () => void;
  maxRetries?: number;
  retryDelay?: number;
}

type Status = 'connected' | 'reconnecting' | 'failed';

export default function SseConnection({
  url,
  events,
  onEvent,
  onConnect,
  maxRetries = 5,
  retryDelay = 3,
}: SseConnectionProps) {
  const [status, setStatus] = useState<Status>('connected');
  const [countdown, setCountdown] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const closeEs = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  const openConnection = (currentRetry: number) => {
    closeEs();

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryCountRef.current = 0;
      setStatus('connected');
      onConnect?.();
    };

    es.onerror = () => {
      closeEs();
      const next = currentRetry + 1;
      retryCountRef.current = next;

      if (next > maxRetries) {
        setStatus('failed');
        return;
      }

      setStatus('reconnecting');
      setCountdown(retryDelay);

      let remaining = retryDelay;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearTimer();
          openConnection(retryCountRef.current);
        }
      }, 1000);
    };

    events.forEach((eventName) => {
      es.addEventListener(eventName, (e: MessageEvent) => {
        let parsed: unknown = e.data;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          // data is not JSON — pass raw string
        }
        onEvent(eventName, parsed);
      });
    });
  };

  useEffect(() => {
    openConnection(0);
    return () => {
      clearTimer();
      closeEs();
    };
    // intentionally run once on mount; url/events changes are not tracked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'reconnecting') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 text-amber-900 py-2 text-center text-sm font-medium">
        Reconectando en {countdown} segundo{countdown !== 1 ? 's' : ''}...
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white py-3 text-center text-sm font-semibold">
        Sin conexión. Contactá a soporte si el problema persiste.
      </div>
    );
  }

  return null;
}
