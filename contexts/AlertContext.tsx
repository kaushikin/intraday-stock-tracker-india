'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AlertType = 'success' | 'danger' | 'info' | 'warning';

export type AppAlert = {
  id: string;
  title: string;
  message: string;
  type: AlertType;
  createdAt: string;
};

type AlertContextValue = {
  alerts: AppAlert[];
  addAlert: (input: {
    title: string;
    message: string;
    type?: AlertType;
    browserNotification?: boolean;
    vibrate?: boolean;
    sound?: boolean;
  }) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
  requestBrowserPermission: () => Promise<void>;
  browserPermission: NotificationPermission | 'unsupported';
};

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function playBeep(type: AlertType) {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    const frequency =
      type === 'danger'
        ? 220
        : type === 'success'
        ? 660
        : type === 'warning'
        ? 440
        : 520;

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.25
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.25);
  } catch {
    // Ignore sound errors
  }
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined') return 'unsupported';
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermission('unsupported');
      alert('Browser notifications are not supported on this device/browser.');
      return;
    }

    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);

    if (permission === 'granted') {
      alert('Notifications enabled.');
    } else {
      alert('Notifications were not enabled.');
    }
  }, []);

  const addAlert: AlertContextValue['addAlert'] = useCallback(
    ({
      title,
      message,
      type = 'info',
      browserNotification = true,
      vibrate = true,
      sound = true,
    }) => {
      const id = createId();

      const alertItem: AppAlert = {
        id,
        title,
        message,
        type,
        createdAt: new Date().toISOString(),
      };

      setAlerts((prev) => [alertItem, ...prev].slice(0, 8));

      setTimeout(() => {
        removeAlert(id);
      }, 8000);

      if (sound && typeof window !== 'undefined') {
        playBeep(type);
      }

      if (
        vibrate &&
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        if (type === 'danger') {
          navigator.vibrate([200, 100, 200]);
        } else {
          navigator.vibrate(150);
        }
      }

      if (
        browserNotification &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, {
            body: message,
          });
        } catch {
          // Ignore notification errors
        }
      }
    },
    [removeAlert]
  );

  const value = useMemo(
    () => ({
      alerts,
      addAlert,
      removeAlert,
      clearAlerts,
      requestBrowserPermission,
      browserPermission,
    }),
    [
      alerts,
      addAlert,
      removeAlert,
      clearAlerts,
      requestBrowserPermission,
      browserPermission,
    ]
  );

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
}

export function useAlerts() {
  const context = useContext(AlertContext);

  if (!context) {
    throw new Error('useAlerts must be used inside AlertProvider');
  }

  return context;
}