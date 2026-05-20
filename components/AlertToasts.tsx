'use client';

import { Bell, CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useAlerts, type AlertType } from '@/contexts/AlertContext';

function getIcon(type: AlertType) {
  if (type === 'success') return <CheckCircle2 className="h-5 w-5" />;
  if (type === 'danger') return <XCircle className="h-5 w-5" />;
  if (type === 'warning') return <TriangleAlert className="h-5 w-5" />;
  return <Info className="h-5 w-5" />;
}

function getClasses(type: AlertType) {
  if (type === 'success') {
    return 'border-green-500/30 bg-green-500/15 text-green-200';
  }

  if (type === 'danger') {
    return 'border-red-500/30 bg-red-500/15 text-red-200';
  }

  if (type === 'warning') {
    return 'border-yellow-500/30 bg-yellow-500/15 text-yellow-200';
  }

  return 'border-blue-500/30 bg-blue-500/15 text-blue-200';
}

export default function AlertToasts() {
  const { alerts, removeAlert } = useAlerts();

  if (!alerts.length) return null;

  return (
    <div className="fixed left-4 right-4 top-4 z-[9999] mx-auto max-w-md space-y-3">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-2xl border p-4 shadow-2xl backdrop-blur ${getClasses(
            alert.type
          )}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getIcon(alert.type)}</div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 opacity-70" />
                <p className="font-bold">{alert.title}</p>
              </div>

              <p className="mt-1 text-sm opacity-90">{alert.message}</p>

              <p className="mt-2 text-xs opacity-60">
                {new Date(alert.createdAt).toLocaleTimeString()}
              </p>
            </div>

            <button
              onClick={() => removeAlert(alert.id)}
              className="rounded-full p-1 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}