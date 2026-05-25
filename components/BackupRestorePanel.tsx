'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Database, Download, Upload } from 'lucide-react';
import { TRADE_RULE_SETTINGS_KEY } from '@/lib/tradeRules';

const BACKUP_VERSION = 1;

const STORAGE_KEYS = {
  watchlist: 'watchlist',
  trades: 'trades',
  trackedSignals: 'tracked_signals_v1',
  tradeRuleSettings: TRADE_RULE_SETTINGS_KEY,
};

type AppBackupFile = {
  app: 'intraday-stock-tracker-india';
  version: number;
  exportedAt: string;
  data: {
    watchlist: unknown;
    trades: unknown;
    trackedSignals: unknown;
    tradeRuleSettings: unknown;
  };
};

function safeJsonParse(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getBackupFilename() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  return `intraday-stock-tracker-backup-${yyyy}-${mm}-${dd}-${hh}${min}.json`;
}

function downloadJson(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], {
    type: 'application/json;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function isValidBackup(input: any): input is AppBackupFile {
  return (
    input &&
    input.app === 'intraday-stock-tracker-india' &&
    typeof input.version === 'number' &&
    input.data &&
    typeof input.data === 'object'
  );
}

export default function BackupRestorePanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  function handleExportBackup() {
    setStatusMessage('');
    setErrorMessage('');

    const backup: AppBackupFile = {
      app: 'intraday-stock-tracker-india',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        watchlist: safeJsonParse(localStorage.getItem(STORAGE_KEYS.watchlist)),
        trades: safeJsonParse(localStorage.getItem(STORAGE_KEYS.trades)),
        trackedSignals: safeJsonParse(
          localStorage.getItem(STORAGE_KEYS.trackedSignals)
        ),
        tradeRuleSettings: safeJsonParse(
          localStorage.getItem(STORAGE_KEYS.tradeRuleSettings)
        ),
      },
    };

    downloadJson(getBackupFilename(), backup);

    setStatusMessage('Backup exported successfully.');
  }

  function openImportPicker() {
    setStatusMessage('');
    setErrorMessage('');
    fileInputRef.current?.click();
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    setStatusMessage('');
    setErrorMessage('');

    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setErrorMessage('Please select a valid .json backup file.');
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!isValidBackup(parsed)) {
        setErrorMessage('This does not look like a valid app backup file.');
        return;
      }

      const confirmed = window.confirm(
        [
          'Restore this backup?',
          '',
          'This will replace your current local app data:',
          '• Watchlist',
          '• Trades',
          '• Tracked signals',
          '• Trade rule settings',
          '',
          'Continue?',
        ].join('\n')
      );

      if (!confirmed) return;

      localStorage.setItem(
        STORAGE_KEYS.watchlist,
        JSON.stringify(parsed.data.watchlist || [])
      );

      localStorage.setItem(
        STORAGE_KEYS.trades,
        JSON.stringify(parsed.data.trades || [])
      );

      localStorage.setItem(
        STORAGE_KEYS.trackedSignals,
        JSON.stringify(parsed.data.trackedSignals || [])
      );

      if (parsed.data.tradeRuleSettings) {
        localStorage.setItem(
          STORAGE_KEYS.tradeRuleSettings,
          JSON.stringify(parsed.data.tradeRuleSettings)
        );
      }

      window.dispatchEvent(new Event('tradeRulesUpdated'));
      window.dispatchEvent(new Event('storage'));

      setStatusMessage('Backup restored successfully. Reloading app...');

      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not import backup. File may be damaged.');
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-slate-800 bg-[#15161b] p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-black/30 p-3 text-emerald-400">
          <Database className="h-6 w-6" />
        </div>

        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">Backup / Restore</h2>

          <p className="mt-2 text-sm text-slate-400">
            Export your local trades, watchlist, tracked signals, and trade rule
            settings to a backup file. Use restore when changing browser/device.
          </p>

          <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Backup files contain your trading journal data. Keep them private.
                This does not export Angel One credentials or API keys.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-bold text-white active:scale-[0.985]"
            >
              <Download className="h-5 w-5" />
              Export Backup
            </button>

            <button
              onClick={openImportPicker}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-4 font-bold text-slate-200 active:scale-[0.985]"
            >
              <Upload className="h-5 w-5" />
              Restore Backup
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          {statusMessage && (
            <div className="mt-4 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
              {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
