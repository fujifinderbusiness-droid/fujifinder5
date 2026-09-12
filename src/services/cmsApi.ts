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
    let errMessage = 'Changes could not be saved. Please try again.';
    try {
      const errData = await res.json();
      if (errData && errData.error) {
        errMessage = errData.error;
      }
    } catch {
      // Use fallback error message
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
// AUTHENTICATION
// -------------------------------------------------------------

export async function loginAdminApi(email: string, password: string): Promise<{ token: string; user: AdminUser }> {
  const res = await apiRequest<{ success: boolean; token: string; user: AdminUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.token) {
    setAdminToken(res.token);
  }
  return res;
}

export async function logoutAdminApi(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    setAdminToken(null);
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
