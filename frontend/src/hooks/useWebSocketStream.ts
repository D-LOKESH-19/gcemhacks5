import { useEffect, useRef, useCallback } from 'react';
import { useSliceStore } from '../store/useSliceStore';
import { TelemetryPayload } from '../types/api';

export function useWebSocketStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef<number>(1000);
  const isDocumentVisibleRef = useRef<boolean>(true);
  const lastRenderTimeRef = useRef<number>(0);

  const setConnectionStatus = useSliceStore((state) => state.setConnectionStatus);
  const processTelemetry = useSliceStore((state) => state.processTelemetry);
  const addToast = useSliceStore((state) => state.addToast);
  const addSpikeMarker = useSliceStore((state) => state.addSpikeMarker);

  // Track document visibility to throttle rendering when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isDocumentVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus('reconnecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // When developing on vite (:5173), proxy to :8050
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectDelayRef.current = 1000; // Reset backoff delay
        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: TelemetryPayload = JSON.parse(event.data);

          // If document is hidden, throttle state updates to prevent memory/CPU buildup
          const now = performance.now();
          if (!isDocumentVisibleRef.current) {
            if (now - lastRenderTimeRef.current < 1000) {
              return;
            }
          }

          // Target ~5 updates per second max for rendering performance
          if (now - lastRenderTimeRef.current >= 150) {
            lastRenderTimeRef.current = now;
            processTelemetry(data);
          }
        } catch (err) {
          console.warn('[WebSocket Stream] Failed to parse telemetry frame:', err);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('reconnecting');
        wsRef.current = null;
        // Exponential backoff: 1s, 2s, 4s, capped at 5s
        const nextDelay = Math.min(reconnectDelayRef.current * 2, 5000);
        reconnectDelayRef.current = nextDelay;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        setConnectionStatus('offline');
        ws.close();
      };
    } catch (err) {
      setConnectionStatus('offline');
      console.warn('[WebSocket] Connection initialization failed:', err);
    }
  }, [setConnectionStatus, processTelemetry]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Command dispatchers
  const sendSpike = useCallback(
    async (sliceName: string, factor = 2.5, duration = 25) => {
      const step = useSliceStore.getState().latestPayload?.step || 0;
      addSpikeMarker({ step, slice: sliceName, factor, duration });

      try {
        const resp = await fetch('/spike', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slice: sliceName, factor, duration }),
        });
        if (!resp.ok) {
          throw new Error(`Server returned HTTP ${resp.status}`);
        }
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Spike Injection Failed',
          message: err instanceof Error ? err.message : 'Network error communicating with simulator',
        });
      }
    },
    [addSpikeMarker, addToast],
  );

  const sendBots = useCallback(
    async (count: number, sliceName?: string, mode = 'set', location?: string) => {
      try {
        const resp = await fetch('/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slice: sliceName, count, mode, location }),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned HTTP ${resp.status}`);
        }
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Bot Modification Failed',
          message: err instanceof Error ? err.message : 'Network error updating virtual bots',
        });
      }
    },
    [addToast],
  );

  const sendReset = useCallback(async () => {
    try {
      useSliceStore.getState().resetTelemetryBuffers();
      const resp = await fetch('/reset', { method: 'POST' });
      if (!resp.ok) {
        throw new Error(`Server returned HTTP ${resp.status}`);
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Reset Failed',
        message: err instanceof Error ? err.message : 'Network error resetting simulation',
      });
    }
  }, [addToast]);

  const sendPause = useCallback(async () => {
    try {
      const resp = await fetch('/pause', { method: 'POST' });
      if (!resp.ok) {
        throw new Error(`Server returned HTTP ${resp.status}`);
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Pause Failed',
        message: err instanceof Error ? err.message : 'Network error toggling pause',
      });
    }
  }, [addToast]);

  return {
    sendSpike,
    sendBots,
    sendReset,
    sendPause,
  };
}
