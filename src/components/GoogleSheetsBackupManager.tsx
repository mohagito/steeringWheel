import React, { useState, useEffect } from "react";
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  LogOut,
  Copy,
  Check,
  X,
  Link2
} from "lucide-react";
import Swal from "sweetalert2";
import { 
  getBackupMetadata, 
  saveBackupMetadata,
  connectGoogleBackupAuth, 
  disconnectGoogleBackupAuth, 
  isGoogleBackupConnected, 
  getCachedGoogleEmail, 
  getCachedGoogleToken, 
  executeLiveBackupSync, 
  fetchFullFirestoreSnapshot, 
  GoogleBackupMetadata 
} from "../services/googleSheetsBackupService";
import { formatSystemDateTime } from "../utils/timeUtils";
import { User } from "../types";

interface GoogleSheetsBackupManagerProps {
  currentUser: User;
  onClose?: () => void;
}

export default function GoogleSheetsBackupManager({ currentUser, onClose }: GoogleSheetsBackupManagerProps) {
  const [meta, setMeta] = useState<GoogleBackupMetadata>({
    spreadsheetId: "",
    spreadsheetUrl: "",
    status: "idle",
    autoSyncEnabled: true
  });
  const [isConnected, setIsConnected] = useState<boolean>(isGoogleBackupConnected());
  const [connectedEmail, setConnectedEmail] = useState<string | null>(getCachedGoogleEmail());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [customSheetInput, setCustomSheetInput] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);

  // Load existing metadata on mount
  useEffect(() => {
    let isMounted = true;
    getBackupMetadata()
      .then((data) => {
        if (isMounted) {
          setMeta(data);
          setIsConnected(isGoogleBackupConnected());
          setConnectedEmail(getCachedGoogleEmail() || data.connectedAccount || null);
        }
      })
      .catch((err) => {
        console.warn("Could not read backup metadata:", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Connect Google Account via OAuth & create initial mirror
  const handleConnect = async () => {
    try {
      setIsSyncing(true);
      const { email, accessToken } = await connectGoogleBackupAuth();
      setIsConnected(true);
      setConnectedEmail(email);

      // Trigger automatic initial copy immediately
      const snapshot = await fetchFullFirestoreSnapshot();
      const res = await executeLiveBackupSync(accessToken, snapshot);
      const updated = await getBackupMetadata();
      setMeta(updated);

      await Swal.fire({
        title: "Spreadsheet Created & Synced!",
        text: `Your Google Sheet backup is ready with ${res.totalRecords} records.`,
        icon: "success",
        confirmButtonText: "Open Google Sheet",
        showCancelButton: true,
        cancelButtonText: "Done",
        confirmButtonColor: "#059669"
      }).then((result) => {
        if (result.isConfirmed && res.spreadsheetUrl) {
          window.open(res.spreadsheetUrl, "_blank", "noopener,noreferrer");
        }
      });
    } catch (err: any) {
      console.error("Connect error:", err);
      Swal.fire({
        title: "Connection Failed",
        text: err?.message || "Could not connect Google account.",
        icon: "error",
        confirmButtonColor: "#2563eb"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Disconnect session
  const handleDisconnect = () => {
    disconnectGoogleBackupAuth();
    setIsConnected(false);
    setConnectedEmail(null);
  };

  // Run Manual Synchronization
  const handleSyncNow = async () => {
    let token = getCachedGoogleToken();
    if (!token) {
      try {
        const authRes = await connectGoogleBackupAuth();
        token = authRes.accessToken;
        setIsConnected(true);
        setConnectedEmail(authRes.email);
      } catch (err) {
        return;
      }
    }

    try {
      setIsSyncing(true);
      const snapshot = await fetchFullFirestoreSnapshot();
      const res = await executeLiveBackupSync(token, snapshot);
      const updated = await getBackupMetadata();
      setMeta(updated);

      await Swal.fire({
        title: "Backup Synchronized",
        text: `Mirrored ${res.totalRecords} records to Google Sheets.`,
        icon: "success",
        timer: 1800,
        showConfirmButton: false
      });
    } catch (err: any) {
      console.error("Sync error:", err);
      Swal.fire({
        title: "Sync Failed",
        text: err?.message || "Could not synchronize backup.",
        icon: "error",
        confirmButtonColor: "#dc2626"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = () => {
    if (!meta.spreadsheetUrl) return;
    navigator.clipboard.writeText(meta.spreadsheetUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Link existing spreadsheet ID
  const handleLinkCustomSheet = async () => {
    const raw = customSheetInput.trim();
    if (!raw) return;

    // Extract ID if full URL pasted
    let id = raw;
    const match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      id = match[1];
    }

    const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    const updated: GoogleBackupMetadata = {
      ...meta,
      spreadsheetId: id,
      spreadsheetUrl: url,
      status: "idle"
    };

    await saveBackupMetadata(updated);
    setMeta(updated);
    setShowCustomInput(false);
    setCustomSheetInput("");
    Swal.fire({
      title: "Spreadsheet Linked",
      text: "Existing Google Sheet ID linked successfully.",
      icon: "success",
      timer: 1600,
      showConfirmButton: false
    });
  };

  const tabsInfo = [
    { name: "CURRENT_STOCK", desc: "Meshes & Bezel S1, S2, S3 snapshot", cols: 9 },
    { name: "OPERATIONS", desc: "Traceable movement history with unique IDs", cols: 12 },
    { name: "INVENTORY", desc: "Physical inventory counts & differences", cols: 10 },
    { name: "DELIVERIES", desc: "Dispatches & Return ZDF logs", cols: 11 },
    { name: "INVOICES_TRUCKS", desc: "Incoming trucks & receiving invoices", cols: 9 },
    { name: "SCRAP_NOK", desc: "Defects, scrap & NOK entries", cols: 9 },
    { name: "DECOMPOSITION", desc: "Steering Wheel to Mesh / Bezel BOM mappings", cols: 5 },
    { name: "REFERENCES", desc: "Active master catalog", cols: 7 },
    { name: "BACKUP_HEALTH", desc: "Disaster recovery parameters & audit specs", cols: 3 }
  ];

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-5" id="google-sheets-backup-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 text-sm tracking-tight">
                Google Sheets Live Backup
              </h4>
              <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Mirror Copy
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
              <span>Firebase = Source of Truth</span>
              <span>•</span>
              <span>One-way read-only sync</span>
            </div>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Action Card: Open Sheet or Connect */}
      {meta.spreadsheetUrl ? (
        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Live Backup Spreadsheet is Ready</span>
            </div>
            <div className="text-[11px] text-emerald-800 font-mono truncate max-w-lg">
              {meta.spreadsheetUrl}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy spreadsheet URL"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? "Copied" : "Copy Link"}</span>
            </button>

            <a
              href={meta.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              id="btn-open-google-sheet-primary"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in Google Sheets</span>
            </a>

            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              id="btn-sync-google-backup-now"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-800">
              No Backup Spreadsheet Linked Yet
            </div>
            <div className="text-[11px] text-slate-500">
              Click below to connect your Google account and automatically create your dedicated 9-tab backup spreadsheet in Google Drive.
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isSyncing}
              id="btn-connect-google-backup-main"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Creating Spreadsheet..." : "Connect & Create Backup Sheet"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCustomInput(!showCustomInput)}
              className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg text-xs transition-colors cursor-pointer"
              title="Link an existing spreadsheet"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Optional: Link Existing Spreadsheet ID */}
      {showCustomInput && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
          <input
            type="text"
            placeholder="Paste existing Google Sheet ID or URL (e.g. 1BxiMVs0XRA5...)"
            value={customSheetInput}
            onChange={(e) => setCustomSheetInput(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={handleLinkCustomSheet}
            className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded cursor-pointer"
          >
            Save ID
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</div>
          <div className="mt-1 flex items-center gap-1.5 font-bold text-xs">
            {meta.status === "synced" ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Synchronized</span>
              </>
            ) : meta.status === "syncing" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                <span className="text-blue-700">Sync in progress</span>
              </>
            ) : meta.status === "error" ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-rose-700">Needs retry</span>
              </>
            ) : (
              <>
                <Database className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-700">{meta.spreadsheetUrl ? "Ready" : "Not connected"}</span>
              </>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Mirrored</div>
          <div className="mt-1 font-mono font-bold text-xs text-slate-800">
            {meta.lastSyncTime ? formatSystemDateTime(meta.lastSyncTime) : "—"}
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Records</div>
          <div className="mt-1 font-mono font-bold text-xs text-slate-800">
            {meta.totalRecords ? `${meta.totalRecords} records` : "—"}
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Google Account</div>
          <div className="mt-1 font-mono text-xs text-slate-700 truncate" title={connectedEmail || undefined}>
            {connectedEmail || "None"}
          </div>
        </div>
      </div>

      {/* Mirrored Tabs Specification Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
          <span>Mirrored Tabs ({tabsInfo.length})</span>
          <span className="font-mono text-[10px] text-slate-500">Africa/Casablanca Timezone • Unique Operation ID Protection</span>
        </div>
        <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto font-mono text-xs">
          {tabsInfo.map((tab) => (
            <div key={tab.name} className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{tab.name}</span>
                <span className="text-[11px] text-slate-500 font-sans">{tab.desc}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">{tab.cols} cols</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  Mirror
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
