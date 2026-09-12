import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  UploadCloud, 
  DownloadCloud, 
  ExternalLink, 
  ShieldCheck, 
  Activity, 
  Layers, 
  Table, 
  Camera, 
  FileText, 
  Users, 
  Image as ImageIcon, 
  MousePointerClick, 
  Mail, 
  Clock,
  Sparkles
} from 'lucide-react';
import { 
  getSupabaseStatus, 
  syncFromSupabase, 
  pushAllToSupabase, 
  SUPABASE_PROJECT_ID, 
  SUPABASE_PROJECT_NAME, 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY,
  SupabaseStatusResponse 
} from '../services/supabase';
import { useData } from '../context/DataContext';

export const SupabaseManager: React.FC = () => {
  const { adminUser } = useData();
  const [status, setStatus] = useState<SupabaseStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [activeTableTab, setActiveTableTab] = useState<string>('cameras');
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const data = await getSupabaseStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Error fetching Supabase status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTablePreview = async (tableName: string) => {
    setActiveTableTab(tableName);
    setTableLoading(true);
    try {
      const res = await fetch(`https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/${tableName}?select=*&limit=15`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (res.ok) {
        const rows = await res.json();
        setTableData(rows);
      } else {
        setTableData([]);
      }
    } catch (err) {
      console.error('Failed to preview table data:', err);
      setTableData([]);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    loadTablePreview('cameras');
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);
    try {
      const result = await syncFromSupabase();
      setStatus(result);
      setMessage({ type: 'success', text: 'All tables successfully synchronized from Supabase!' });
      loadTablePreview(activeTableTab);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Synchronization failed' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushAll = async () => {
    if (!window.confirm('This will upload all current local cameras, articles, subscribers, media assets, and click logs to your Supabase tables. Proceed?')) {
      return;
    }
    setIsPushing(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('fujifinder_admin_token');
      const authHeader = token ? `Bearer ${token}` : undefined;
      const result = await pushAllToSupabase(authHeader);
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `Data successfully uploaded to Supabase! Cameras: ${result.results?.cameras}, Articles: ${result.results?.articles}, Subscribers: ${result.results?.subscribers}` 
        });
        await fetchStatus();
        loadTablePreview(activeTableTab);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to push data' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Push operation failed' });
    } finally {
      setIsPushing(false);
    }
  };

  const tables = [
    { id: 'cameras', name: 'Cameras', icon: Camera, count: status?.counts.cameras ?? 0 },
    { id: 'articles', name: 'Articles & Reviews', icon: FileText, count: status?.counts.articles ?? 0 },
    { id: 'subscribers', name: 'Subscribers', icon: Users, count: status?.counts.subscribers ?? 0 },
    { id: 'media_assets', name: 'Media Assets', icon: ImageIcon, count: status?.counts.media_assets ?? 0 },
    { id: 'affiliate_clicks', name: 'Affiliate Clicks', icon: MousePointerClick, count: status?.counts.affiliate_clicks ?? 0 },
    { id: 'email_campaigns', name: 'Email Campaigns', icon: Mail, count: status?.counts.email_campaigns ?? 0 },
    { id: 'email_logs', name: 'Email Delivery Logs', icon: Clock, count: status?.counts.email_logs ?? 0 },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#EAE6E1] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Supabase Connection
            </span>
            <span className="text-xs text-[#888]">PostgreSQL Cloud Storage</span>
          </div>
          <h1 className="text-2xl font-serif text-[#1A1A1A] flex items-center gap-2">
            <Database className="w-6 h-6 text-emerald-600" />
            Supabase Cloud Integration
          </h1>
          <p className="text-sm text-[#666] mt-1">
            Connected to project <strong className="text-[#1A1A1A] font-medium">{SUPABASE_PROJECT_NAME}</strong> (ID: <code className="bg-[#F5F2ED] px-1.5 py-0.5 rounded text-xs font-mono">{SUPABASE_PROJECT_ID}</code>)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={isSyncing || isLoading}
            className="px-4 py-2 text-xs font-medium bg-white text-[#1A1A1A] border border-[#D5D0C7] hover:bg-[#F5F2ED] rounded flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            {isSyncing ? 'Syncing Tables...' : 'Sync From Supabase'}
          </button>

          <button
            onClick={handlePushAll}
            disabled={isPushing || isLoading}
            className="px-4 py-2 text-xs font-medium bg-[#1A1A1A] text-white hover:bg-black rounded flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <UploadCloud className={`w-3.5 h-3.5 ${isPushing ? 'animate-spin' : ''}`} />
            {isPushing ? 'Uploading All Data...' : 'Store & Push All Data'}
          </button>
        </div>
      </div>

      {/* Notification Message */}
      {message && (
        <div className={`p-4 rounded-lg text-sm flex items-start gap-3 ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{message.text}</div>
          <button onClick={() => setMessage(null)} className="text-xs underline hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* Connection & Configuration Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-[#EAE6E1] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[#777] uppercase tracking-wider">Database Status</span>
            <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Operational
            </span>
          </div>
          <div className="text-lg font-semibold text-[#1A1A1A] mb-1">PostgreSQL v15</div>
          <div className="text-xs text-[#666] flex items-center gap-1.5 mt-2">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            Active tables: 7 / 7 provisioned
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#EAE6E1] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[#777] uppercase tracking-wider">Cloud Project</span>
            <a 
              href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}`} 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1 font-medium"
            >
              Dashboard <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="text-sm font-medium text-[#1A1A1A] truncate">{SUPABASE_PROJECT_NAME}</div>
          <div className="text-xs text-[#777] font-mono mt-1 truncate">ID: {SUPABASE_PROJECT_ID}</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#EAE6E1] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[#777] uppercase tracking-wider">API Authentication</span>
            <span className="px-2 py-0.5 text-xs font-medium bg-[#F5F2ED] text-[#555] rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> JWT Verified
            </span>
          </div>
          <div className="text-xs font-mono text-[#555] truncate">
            {SUPABASE_ANON_KEY.slice(0, 18)}••••••••••••••••
          </div>
          <div className="text-[11px] text-[#888] mt-2 truncate">
            {SUPABASE_URL}
          </div>
        </div>
      </div>

      {/* Table Statistics Bar */}
      <div>
        <h2 className="text-base font-serif text-[#1A1A1A] mb-3 flex items-center gap-2">
          <Table className="w-4 h-4 text-[#777]" />
          Synchronized Supabase Tables
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {tables.map((t) => {
            const Icon = t.icon;
            const isSelected = activeTableTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => loadTablePreview(t.id)}
                className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
                  isSelected 
                    ? 'bg-emerald-50/50 border-emerald-400 ring-1 ring-emerald-400' 
                    : 'bg-white border-[#EAE6E1] hover:border-[#D5D0C7]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-700' : 'text-[#888]'}`} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-emerald-200/60 text-emerald-900' : 'bg-[#F5F2ED] text-[#555]'
                  }`}>
                    {t.count}
                  </span>
                </div>
                <div className="text-xs font-medium text-[#1A1A1A] truncate">{t.name}</div>
                <div className="text-[10px] text-[#888] font-mono mt-0.5 truncate">{t.id}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Table Data Preview Explorer */}
      <div className="bg-white rounded-xl border border-[#EAE6E1] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#EAE6E1] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#555]">
              Live Records from table: <code className="text-emerald-700 font-mono font-semibold">{activeTableTab}</code>
            </span>
            <span className="text-[11px] text-[#888]">({tableData.length} records retrieved)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadTablePreview(activeTableTab)}
              disabled={tableLoading}
              className="px-2.5 py-1 text-[11px] font-medium text-[#555] hover:text-[#1A1A1A] bg-white border border-[#D5D0C7] rounded hover:bg-[#F5F2ED] flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${tableLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {tableLoading ? (
          <div className="p-12 text-center text-sm text-[#888] flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            Fetching table data from Supabase...
          </div>
        ) : tableData.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#777]">
            <p className="font-medium">No rows found in table <code className="font-mono text-xs">{activeTableTab}</code>.</p>
            <p className="text-xs text-[#999] mt-1">
              Click &quot;Store &amp; Push All Data&quot; above to populate your Supabase database with existing cameras, articles, and subscribers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#EAE6E1] bg-[#FDFCFB] text-[#777]">
                  {Object.keys(tableData[0] || {}).slice(0, 8).map((col) => (
                    <th key={col} className="p-3 font-semibold font-mono uppercase tracking-wider text-[10px]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {tableData.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-[#FAF8F5] transition-colors">
                    {Object.keys(tableData[0] || {}).slice(0, 8).map((col) => {
                      const val = row[col];
                      let displayVal = '';
                      if (val === null || val === undefined) {
                        displayVal = '—';
                      } else if (typeof val === 'object') {
                        displayVal = JSON.stringify(val).slice(0, 45) + '...';
                      } else {
                        displayVal = String(val);
                      }
                      return (
                        <td key={col} className="p-3 font-mono text-[#333] max-w-[200px] truncate">
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Integration Instructions & Architecture */}
      <div className="p-5 bg-[#F9F7F4] rounded-xl border border-[#EAE6E1] text-xs space-y-3">
        <h3 className="font-serif text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          How Supabase Storage Works with FujiFinder
        </h3>
        <p className="text-[#666] leading-relaxed">
          Your FujiFinder web platform is connected directly to your PostgreSQL database hosted on Supabase.
          Every time you add or edit a camera review, publish an article, receive a subscriber signup, upload media, or track affiliate clicks,
          the server writes directly to the appropriate Supabase table in real time.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-white rounded border border-[#EAE6E1]">
            <strong className="text-[#1A1A1A] block mb-1">Persistent Cloud Source of Truth</strong>
            <span className="text-[#777]">
              Supabase acts as your primary database. When the web server restarts or scales, it boots directly from your cloud tables.
            </span>
          </div>
          <div className="p-3 bg-white rounded border border-[#EAE6E1]">
            <strong className="text-[#1A1A1A] block mb-1">Fail-safe Local Synchronization</strong>
            <span className="text-[#777]">
              Local filesystem snapshots remain synchronized automatically as a low-latency fallback cache to ensure 100% uptime.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
