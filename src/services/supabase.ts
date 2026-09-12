import { createClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_ID = 'zxzitnulvhbnkjvfsmig';
export const SUPABASE_PROJECT_NAME = "fujifinderbusiness-droid's Org";
export const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://zxzitnulvhbnkjvfsmig.supabase.co';
export const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_j9gqv0_d5oWjRDPUkFjeCQ_FoKmV7JN';


// Client-side Supabase client instance for public queries and real-time listeners
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface SupabaseStatusResponse {
  success: boolean;
  connected: boolean;
  projectId: string;
  projectUrl: string;
  lastSyncAt: string | null;
  counts: {
    cameras: number;
    articles: number;
    subscribers: number;
    media_assets: number;
    affiliate_clicks: number;
    email_campaigns: number;
    email_logs: number;
  };
  test?: {
    ok: boolean;
    message: string;
  };
  timestamp?: string;
  error?: string;
}

/**
 * Check Supabase connection health & table counts via server proxy
 */
export async function getSupabaseStatus(): Promise<SupabaseStatusResponse> {
  try {
    const res = await fetch('/api/supabase/status');
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      connected: false,
      projectId: SUPABASE_PROJECT_ID,
      projectUrl: SUPABASE_URL,
      lastSyncAt: null,
      counts: {
        cameras: 0,
        articles: 0,
        subscribers: 0,
        media_assets: 0,
        affiliate_clicks: 0,
        email_campaigns: 0,
        email_logs: 0,
      },
      error: err.message || 'Network error fetching Supabase status',
    };
  }
}

/**
 * Trigger immediate full sync from Supabase tables
 */
export async function syncFromSupabase(): Promise<SupabaseStatusResponse> {
  const res = await fetch('/api/supabase/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return await res.json();
}

/**
 * Push all local data into Supabase tables
 */
export async function pushAllToSupabase(authHeader?: string): Promise<any> {
  const res = await fetch('/api/supabase/push-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });
  return await res.json();
}
