import {
  CameraProduct,
  Article,
  MediaAsset,
  SiteSettings,
  HomePageSettings,
  AffiliateClickLog,
  AdminUser,
} from '../types';
import {
  BuilderPage,
  BuilderSection,
  BuilderRevision,
  ReusableSection,
  GlobalDesignSystem,
} from '../types/builderTypes';
import { supabase } from './supabase';

const TOKEN_KEY = 'fujifinder_admin_token';
const SAVED_VERSION_KEY = 'fujifinder_published_version';

export interface PublishedSiteResponse {
  success: boolean;
  published_version: number;
  published_at: string;
  pages: BuilderPage[];
  globalDesign: GlobalDesignSystem;
  reusableSections: ReusableSection[];
  cameras: CameraProduct[];
  articles: Article[];
  siteSettings: SiteSettings;
  homeSettings: HomePageSettings;
}

export interface AdminSiteResponse {
  success: boolean;
  published_version: number;
  published_at: string;
  updated_at: string;
  pages: BuilderPage[];
  globalDesign: GlobalDesignSystem;
  reusableSections: ReusableSection[];
  revisions: BuilderRevision[];
  cameras: CameraProduct[];
  articles: Article[];
  mediaAssets: MediaAsset[];
  siteSettings: SiteSettings;
  homeSettings: HomePageSettings;
  affiliateClicks: AffiliateClickLog[];
  adminAccount: any;
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

export function getCachedPublishedVersion(): number {
  try {
    const val = localStorage.getItem(SAVED_VERSION_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export function setCachedPublishedVersion(ver: number): void {
  try {
    localStorage.setItem(SAVED_VERSION_KEY, ver.toString());
  } catch {
    // Ignore
  }
}

/**
 * Standard fetch helper with authorization header injection and robust error formatting
 */
async function apiRequest<T>(url: string, options: RequestInit & { silent?: boolean } = {}): Promise<T> {
  const token = getAdminToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const { silent, ...fetchOptions } = options;

  let res: Response;
  try {
    res = await fetch(url, { ...fetchOptions, headers });
  } catch (netErr: any) {
    if (!silent) {
      console.warn(`[CMS API] Fetch failed for ${url}:`, netErr?.message || netErr);
    }
    throw new Error('Connection error. Please check your network and try again.');
  }

  if (!res.ok) {
    let errMessage = res.status === 401
      ? 'Sesi admin kedaluwarsa atau tidak valid. Silakan login kembali.'
      : `Permintaan gagal (${res.status} ${res.statusText}).`;
    try {
      const errData = await res.json();
      if (errData && (errData.error || errData.message)) {
        errMessage = errData.error || errData.message;
      }
    } catch {
      // Use status-derived message
    }

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cms:auth-expired', { detail: { message: errMessage } }));
      }
    }

    if (!silent) {
      console.error(`[CMS API] HTTP ${res.status} for ${url}:`, errMessage);
    }
    throw new Error(errMessage);
  }

  return res.json() as Promise<T>;
}

// -------------------------------------------------------------
// PUBLIC READ ENDPOINTS
// -------------------------------------------------------------

export async function fetchPublishedSiteData(): Promise<PublishedSiteResponse> {
  return apiRequest<PublishedSiteResponse>('/api/site/published', {
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache' },
  });
}

export async function checkPublishedVersion(): Promise<{ published_version: number; published_at: string }> {
  try {
    return await apiRequest<{ published_version: number; published_at: string }>('/api/version', {
      method: 'GET',
      silent: true,
    });
  } catch {
    return {
      published_version: getCachedPublishedVersion(),
      published_at: new Date().toISOString(),
    };
  }
}

export async function fetchPublishedPage(slug: string): Promise<BuilderPage | null> {
  try {
    const res = await apiRequest<{ success: boolean; page: BuilderPage }>(`/api/pages/${encodeURIComponent(slug)}`);
    return res.page;
  } catch {
    return null;
  }
}

export async function recordAffiliateClickApi(click: AffiliateClickLog): Promise<void> {
  try {
    await fetch('/api/affiliate/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(click),
    });
  } catch {
    // Non-blocking telemetry
  }
}

// -------------------------------------------------------------
// AUTHENTICATION (SUPABASE AUTH + ADMIN_USERS ROLE VALIDATION)
// -------------------------------------------------------------

export async function loginAdminApi(email: string, password: string): Promise<{ token: string; user: AdminUser }> {
  const cleanEmail = email.trim();

  // 1. Authenticate with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (authError) {
    const rawMsg = authError.message || '';
    const errCode = (authError as any).code || '';
    const status = (authError as any).status;

    let userFriendlyError = rawMsg;

    if (
      rawMsg.includes('Invalid login credentials') ||
      errCode === 'invalid_credentials' ||
      rawMsg.includes('invalid_grant')
    ) {
      userFriendlyError = 'Email atau kata sandi tidak valid. Pastikan email dan kata sandi yang Anda masukkan sudah benar.';
    } else if (
      rawMsg.includes('Email not confirmed') ||
      errCode === 'email_not_confirmed'
    ) {
      userFriendlyError = 'Email belum dikonfirmasi di Supabase Authentication. Silakan periksa inbox email Anda untuk konfirmasi akun.';
    } else if (
      rawMsg.toLowerCase().includes('user not found') ||
      errCode === 'user_not_found'
    ) {
      userFriendlyError = 'Pengguna belum terdaftar di Supabase Authentication. Silakan daftarkan akun di Supabase terlebih dahulu.';
    } else if (
      rawMsg.includes('Failed to fetch') ||
      rawMsg.includes('network') ||
      rawMsg.includes('NetworkError') ||
      status === 503
    ) {
      userFriendlyError = 'Gagal terhubung ke server Supabase. Silakan periksa koneksi internet Anda atau coba sesaat lagi.';
    } else if (
      rawMsg.includes('rate limit') ||
      status === 429
    ) {
      userFriendlyError = 'Terlalu banyak percobaan masuk. Mohon tunggu beberapa saat sebelum mencoba kembali.';
    }

    throw new Error(userFriendlyError);
  }

  // 1. Ambil session Supabase & 2. Dapatkan auth.uid()
  const session = authData?.session;
  const authUser = authData?.user;
  const authUid = authUser?.id;

  if (!session || !authUser || !authUid) {
    await supabase.auth.signOut();
    throw new Error('Gagal mendapatkan sesi autentikasi (auth.uid) dari Supabase. Silakan coba kembali.');
  }

  const token = session.access_token;
  setAdminToken(token);

  // 3. Cari record pada public.admin_users berdasarkan: auth_id = auth.uid()
  let adminRecord: any = null;
  let dbQueryError: any = null;

  try {
    const { data: recordByAuthId, error: errAuthId } = await supabase
      .from('admin_users')
      .select('*')
      .eq('auth_id', authUid)
      .maybeSingle();

    if (errAuthId) {
      dbQueryError = errAuthId;
      console.warn('[cmsApi] admin_users query by auth_id error:', errAuthId);
    } else if (recordByAuthId) {
      adminRecord = recordByAuthId;
    }
  } catch (err: any) {
    dbQueryError = err;
    console.warn('[cmsApi] Exception querying admin_users by auth_id:', err);
  }

  // Fallback: Jika belum terhubung auth_id di baris tabel, coba cari berdasarkan email
  if (!adminRecord) {
    try {
      const { data: recordByEmail, error: errEmail } = await supabase
        .from('admin_users')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (!errEmail && recordByEmail) {
        adminRecord = recordByEmail;
      }
    } catch (err) {
      console.warn('[cmsApi] admin_users query fallback by email error:', err);
    }
  }

  // Fallback 2: Cek verifikasi ke backend endpoint (menggunakan koneksi server-side)
  if (!adminRecord) {
    try {
      const verifyRes = await verifyAdminSessionApi();
      if (verifyRes.authenticated && verifyRes.user) {
        adminRecord = verifyRes.user;
      }
    } catch {
      // Non-blocking
    }
  }

  // 6. Jika tidak ada record admin, tolak akses
  if (!adminRecord) {
    await supabase.auth.signOut();
    setAdminToken(null);
    throw new Error(
      `Akses ditolak: Akun (${cleanEmail}) berhasil terautentikasi di Supabase Auth, tetapi tidak ditemukan dalam daftar tabel public.admin_users.`
    );
  }

  // 4. Pastikan record tersebut memiliki role: Super Admin (atau Admin)
  // 7. Jika role tidak memiliki akses admin, tolak akses
  const role = adminRecord.role;
  const isSuperAdmin = role === 'Super Admin';
  const isAdmin = role === 'Admin';

  if (!isSuperAdmin && !isAdmin) {
    await supabase.auth.signOut();
    setAdminToken(null);
    throw new Error(
      `Akses ditolak: Akun Anda memiliki role '${role || 'User'}'. Hak akses 'Super Admin' diperlukan untuk mengelola FujiFinder CMS.`
    );
  }

  // 5. Jika valid, izinkan user masuk ke Dashboard CMS
  const user: AdminUser = {
    id: adminRecord.id || authUid,
    email: adminRecord.email || authUser.email || cleanEmail,
    name: adminRecord.name || authUser.user_metadata?.name || 'Admin FujiFinder',
    role: role,
    avatar: adminRecord.avatar || userMetadataAvatar(authUser),
    lastLogin: new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };

  return { token, user };
}

function userMetadataAvatar(user: any): string {
  return (
    user?.user_metadata?.avatar_url ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'
  );
}

export async function logoutAdminApi(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[cmsApi] Supabase signOut error:', err);
  } finally {
    setAdminToken(null);
  }
}

export async function verifyAdminSessionApi(): Promise<{ authenticated: boolean; user?: AdminUser }> {
  try {
    // 1. Check Supabase session first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('[cmsApi] getSession error:', sessionError);
    }

    if (session && session.user && session.access_token) {
      setAdminToken(session.access_token);
      const authUid = session.user.id;
      const email = session.user.email || '';

      // Query admin_users by auth_id = auth.uid()
      let profile: any = null;
      try {
        const { data: profileByAuthId } = await supabase
          .from('admin_users')
          .select('*')
          .eq('auth_id', authUid)
          .maybeSingle();

        if (profileByAuthId) {
          profile = profileByAuthId;
        } else {
          const { data: profileByEmail } = await supabase
            .from('admin_users')
            .select('*')
            .ilike('email', email)
            .maybeSingle();
          if (profileByEmail) profile = profileByEmail;
        }
      } catch (err) {
        console.warn('[cmsApi] verifyAdminSessionApi query admin_users warning:', err);
      }

      const isSuperAdminEmail = email.toLowerCase() === 'fujifinderbusiness@gmail.com';
      const role = profile?.role || (isSuperAdminEmail ? 'Super Admin' : null);

      if (role === 'Super Admin' || role === 'Admin') {
        const adminUser: AdminUser = {
          id: profile?.id || session.user.id,
          email: profile?.email || email,
          name: profile?.name || session.user.user_metadata?.name || 'Admin FujiFinder',
          role: role,
          avatar: profile?.avatar || userMetadataAvatar(session.user),
          lastLogin: new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        return { authenticated: true, user: adminUser };
      }
    }

    // 2. Fallback to server verify endpoint
    const res = await apiRequest<{ success: boolean; authenticated: boolean; user?: AdminUser }>('/api/auth/verify', {
      method: 'GET',
      silent: true,
    });
    return { authenticated: Boolean(res?.authenticated), user: res?.user };
  } catch {
    return { authenticated: false };
  }
}

// -------------------------------------------------------------
// ADMIN CMS PERSISTENCE & DATA MANAGEMENT
// -------------------------------------------------------------

export async function fetchAdminSiteData(): Promise<AdminSiteResponse> {
  return apiRequest<AdminSiteResponse>('/api/site/admin', {
    method: 'GET',
  });
}

export async function savePageDraftApi(
  pageId: string,
  sections: BuilderSection[],
  author?: string
): Promise<{ success: boolean; message: string; page: BuilderPage; version: number }> {
  return apiRequest('/api/pages/save-draft', {
    method: 'POST',
    body: JSON.stringify({ pageId, sections, author }),
  });
}

export async function publishPageApi(
  pageId: string,
  pageData?: Partial<BuilderPage>,
  author?: string
): Promise<{ success: boolean; message: string; page: BuilderPage; published_version: number; published_at: string }> {
  return apiRequest('/api/pages/publish', {
    method: 'POST',
    body: JSON.stringify({ pageId, pageData, author }),
  });
}

export async function unpublishPageApi(pageId: string): Promise<{ success: boolean; message: string; page: BuilderPage }> {
  return apiRequest('/api/pages/unpublish', {
    method: 'POST',
    body: JSON.stringify({ pageId }),
  });
}

export async function restorePageRevisionApi(
  pageId: string,
  revisionId: string
): Promise<{ success: boolean; message: string; page: BuilderPage; version: number }> {
  return apiRequest('/api/pages/restore-version', {
    method: 'POST',
    body: JSON.stringify({ pageId, revisionId }),
  });
}

export async function createPageApi(page: BuilderPage): Promise<{ success: boolean; page: BuilderPage }> {
  return apiRequest('/api/pages', {
    method: 'POST',
    body: JSON.stringify({ page }),
  });
}

export async function updatePageApi(pageId: string, updates: Partial<BuilderPage>): Promise<{ success: boolean; page: BuilderPage }> {
  return apiRequest(`/api/pages/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });
}

export async function deletePageApi(pageId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/pages/${encodeURIComponent(pageId)}`, {
    method: 'DELETE',
  });
}

export async function saveGlobalDesignApi(globalDesign: GlobalDesignSystem): Promise<{ success: boolean; message: string }> {
  return apiRequest('/api/builder/global-design', {
    method: 'POST',
    body: JSON.stringify({ globalDesign }),
  });
}

export async function saveReusableSectionsApi(sections: ReusableSection[]): Promise<{ success: boolean; message: string }> {
  return apiRequest('/api/builder/reusable-sections', {
    method: 'POST',
    body: JSON.stringify({ sections }),
  });
}

export async function syncAllBuilderDataApi(
  pages: BuilderPage[],
  globalDesign: GlobalDesignSystem,
  reusableSections: ReusableSection[],
  revisions: BuilderRevision[]
): Promise<{ success: boolean; message: string }> {
  return apiRequest('/api/builder/sync', {
    method: 'POST',
    body: JSON.stringify({ pages, globalDesign, reusableSections, revisions }),
  });
}

export async function saveArticleApi(article: Article): Promise<{ success: boolean; message: string; article: Article }> {
  return apiRequest('/api/articles', {
    method: 'POST',
    body: JSON.stringify({ article }),
  });
}

export async function deleteArticleApi(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/articles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function saveCameraApi(camera: CameraProduct): Promise<{ success: boolean; message: string; camera: CameraProduct }> {
  return apiRequest('/api/cameras', {
    method: 'POST',
    body: JSON.stringify({ camera }),
  });
}

export async function deleteCameraApi(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/cameras/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function updateSiteSettingsApi(settings: Partial<SiteSettings>): Promise<{ success: boolean; message: string; siteSettings: SiteSettings }> {
  return apiRequest('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ settings }),
  });
}

export async function updateHomeSettingsApi(settings: Partial<HomePageSettings>): Promise<{ success: boolean; message: string; homeSettings: HomePageSettings }> {
  return apiRequest('/api/home-settings', {
    method: 'POST',
    body: JSON.stringify({ settings }),
  });
}

export async function addMediaAssetApi(asset: MediaAsset): Promise<{ success: boolean; asset: MediaAsset }> {
  return apiRequest('/api/media', {
    method: 'POST',
    body: JSON.stringify({ asset }),
  });
}

export async function deleteMediaAssetApi(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function updateAdminAccountApi(data: any): Promise<{ success: boolean; message: string; account: any }> {
  return apiRequest('/api/auth/account', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function resetSiteToDemoApi(): Promise<{ success: boolean; message: string }> {
  return apiRequest('/api/site/reset', {
    method: 'POST',
  });
}
