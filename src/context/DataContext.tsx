import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  CameraProduct,
  Article,
  MediaAsset,
  SiteSettings,
  AffiliateClickLog,
  AdminUser,
  AdminAccountConfig,
  HomePageSettings,
} from '../types';
import {
  initialCameras,
  initialArticles,
  initialMediaAssets,
  initialSiteSettings,
  initialHomePageSettings,
} from '../data/initialData';
import { supabase } from '../services/supabase';
import {
  fetchPublishedSiteData,
  fetchAdminSiteData,
  checkPublishedVersion,
  loginAdminApi,
  logoutAdminApi,
  verifyAdminSessionApi,
  saveArticleApi,
  deleteArticleApi,
  saveCameraApi,
  deleteCameraApi,
  updateSiteSettingsApi,
  updateHomeSettingsApi,
  addMediaAssetApi,
  deleteMediaAssetApi,
  recordAffiliateClickApi,
  resetSiteToDemoApi,
  updateAdminAccountApi,
  getAdminToken,
  setAdminToken,
  getCachedPublishedVersion,
  setCachedPublishedVersion,
} from '../services/cmsApi';

interface DataContextType {
  cameras: CameraProduct[];
  articles: Article[];
  mediaAssets: MediaAsset[];
  siteSettings: SiteSettings;
  homeSettings: HomePageSettings;
  affiliateClicks: AffiliateClickLog[];
  currentView: string;
  activeSlug: string | null;
  adminTab: string;
  editingArticleId: string | null;
  editingCameraId: string | null;
  comparedCameraIds: string[];
  searchModalOpen: boolean;
  searchQuery: string;
  selectedCategory: string | null;

  // Synchronization status
  publishedVersion: number;
  isSyncing: boolean;
  syncError: string | null;
  refreshData: () => Promise<void>;

  // Admin Auth & Account
  adminUser: AdminUser | null;
  isAdminLoggedIn: boolean;
  adminAccount: AdminAccountConfig;
  loginAdmin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: () => Promise<void>;
  updateAdminAccount: (updated: Partial<AdminAccountConfig>) => Promise<void>;

  // Navigation
  navigateTo: (view: string, slug?: string) => void;
  setAdminTab: (tab: string) => void;
  setEditingArticleId: (id: string | null) => void;
  setEditingCameraId: (id: string | null) => void;
  setComparedCameraIds: (ids: string[]) => void;
  toggleCompareCamera: (id: string) => void;
  setSearchModalOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (cat: string | null) => void;

  // CRUD for Articles
  saveArticle: (article: Article) => Promise<{ success: boolean; message: string }>;
  deleteArticle: (id: string) => Promise<{ success: boolean; message: string }>;
  togglePublishArticle: (id: string) => Promise<{ success: boolean; message: string }>;
  getArticleBySlug: (slug: string) => Article | undefined;

  // CRUD for Cameras
  saveCamera: (camera: CameraProduct) => Promise<{ success: boolean; message: string }>;
  deleteCamera: (id: string) => Promise<{ success: boolean; message: string }>;
  toggleCameraStatus: (id: string) => Promise<{ success: boolean; message: string }>;
  getCameraBySlug: (slug: string) => CameraProduct | undefined;
  getCameraById: (id: string) => CameraProduct | undefined;

  // Affiliate Management
  updateAffiliateLink: (productId: string, linkId: string, newUrl: string, newPrice?: number, inStock?: boolean) => void;
  recordAffiliateClick: (
    productId: string,
    retailer: string,
    sourceType: 'article' | 'product_page' | 'comparison' | 'landing_card' | 'quick_finder',
    sourceSlug?: string
  ) => void;

  // Media & Settings
  addMediaAsset: (asset: Omit<MediaAsset, 'id' | 'uploadedAt'>) => Promise<void>;
  deleteMediaAsset: (id: string) => Promise<void>;
  updateSiteSettings: (settings: Partial<SiteSettings>) => Promise<{ success: boolean; message: string }>;
  updateHomeSettings: (settings: Partial<HomePageSettings>) => Promise<{ success: boolean; message: string }>;
  resetToDemoData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const STORAGE_KEYS = {
  ADMIN_SESSION: 'fujifinder_admin_session_v1',
};

const DEFAULT_ADMIN_ACCOUNT: AdminAccountConfig = {
  email: 'fujifinderbusiness@gmail.com',
  passwordHash: 'mautahuaja',
  name: 'Admin FujiFinder',
  role: 'Super Admin',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State variables
  const [cameras, setCameras] = useState<CameraProduct[]>(() =>
    initialCameras.map((c) => ({ ...c, status: c.status || 'published' }))
  );
  const [articles, setArticles] = useState<Article[]>(() => initialArticles);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => initialMediaAssets);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => initialSiteSettings);
  const [homeSettings, setHomeSettings] = useState<HomePageSettings>(() => initialHomePageSettings);
  const [affiliateClicks, setAffiliateClicks] = useState<AffiliateClickLog[]>([]);

  // Synchronization status
  const [publishedVersion, setPublishedVersion] = useState<number>(() => getCachedPublishedVersion());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Navigation State
  const [currentView, setCurrentView] = useState<string>('landing');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<string>('dashboard');
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [comparedCameraIds, setComparedCameraIds] = useState<string[]>(['sony-a7iv', 'canon-r6-ii']);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Admin Account & Session State
  const [adminAccount, setAdminAccount] = useState<AdminAccountConfig>(DEFAULT_ADMIN_ACCOUNT);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    try {
      const token = getAdminToken();
      if (!token) {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
        return null;
      }
      const saved = localStorage.getItem(STORAGE_KEYS.ADMIN_SESSION);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const isAdminLoggedIn = Boolean(
    adminUser &&
    getAdminToken() &&
    (adminUser.role === 'Super Admin' || adminUser.role === 'Admin')
  );
  const versionRef = useRef(publishedVersion);
  versionRef.current = publishedVersion;

  // -------------------------------------------------------------
  // SUPABASE AUTH SESSION SYNC & REALTIME STATE LISTENER
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    // 1. Check existing Supabase session on startup
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user && session?.access_token) {
        setAdminToken(session.access_token);
        try {
          const verifyRes = await verifyAdminSessionApi();
          if (isMounted && verifyRes.authenticated && verifyRes.user) {
            setAdminUser(verifyRes.user);
            try {
              localStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, JSON.stringify(verifyRes.user));
            } catch {}
          } else if (isMounted && !verifyRes.authenticated) {
            setAdminUser(null);
            setAdminToken(null);
            try {
              localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
            } catch {}
          }
        } catch (e) {
          console.warn('[DataContext] Session verify check warning:', e);
        }
      }
    });

    // 2. Realtime listener for login, logout, and token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_OUT' || !session) {
        setAdminUser(null);
        setAdminToken(null);
        try {
          localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
        } catch {}
      } else if (session?.access_token) {
        setAdminToken(session.access_token);
        if (event === 'PASSWORD_RECOVERY') {
          setCurrentView('reset-password');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const verifyRes = await verifyAdminSessionApi();
          if (isMounted && verifyRes.authenticated && verifyRes.user) {
            setAdminUser(verifyRes.user);
            try {
              localStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, JSON.stringify(verifyRes.user));
            } catch {}
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

// -------------------------------------------------------------
// DIRECT SUPABASE FALLBACK LOADER
// -------------------------------------------------------------

async function fetchArticlesDirectFromSupabase(): Promise<Article[]> {
  try {
    const { data, error } = await supabase.from('articles').select('*');
    if (error || !data || data.length === 0) return [];
    return data.map((row: any): Article => {
      const raw = row.data && typeof row.data === 'object' ? row.data : {};
      const authorName = typeof row.author === 'string' ? row.author : (raw.author?.name || 'FujiFinder Editorial');
      return {
        id: row.id,
        slug: row.slug || raw.slug || row.id,
        title: row.title || raw.title || 'Untitled Article',
        subtitle: row.subtitle || raw.subtitle || '',
        excerpt: row.excerpt || raw.excerpt || '',
        category: row.category || raw.category || 'Mirrorless',
        author: {
          name: authorName,
          role: raw.author?.role || 'Staff Writer',
          avatar: raw.author?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
          bio: raw.author?.bio || '',
        },
        publishedAt: row.published_at || raw.publishedAt || new Date().toISOString().split('T')[0],
        updatedAt: row.updated_at || raw.updatedAt || new Date().toISOString().split('T')[0],
        readTimeMinutes: row.read_time_minutes || raw.readTimeMinutes || 5,
        coverImage: row.cover_image || raw.coverImage || 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
        featured: Boolean(row.featured ?? raw.featured),
        blocks: Array.isArray(row.blocks) && row.blocks.length > 0 ? row.blocks : (Array.isArray(raw.blocks) ? raw.blocks : []),
        featuredCameraIds: Array.isArray(raw.featuredCameraIds) ? raw.featuredCameraIds : (row.related_camera_id ? [row.related_camera_id] : []),
        relatedArticleSlugs: Array.isArray(raw.relatedArticleSlugs) ? raw.relatedArticleSlugs : [],
        seo: row.seo && Object.keys(row.seo).length > 0 ? row.seo : (raw.seo || { metaTitle: row.title }),
        status: (row.status || raw.status || 'published') as any,
        views: typeof row.view_count === 'number' ? row.view_count : (raw.views || 0),
        affiliateClicks: raw.affiliateClicks || 0,
        isPopularNow: Boolean(raw.isPopularNow),
        isTrending: Boolean(raw.isTrending),
        isHeroFeatured: Boolean(raw.isHeroFeatured),
        showOnLandingPage: Boolean(raw.showOnLandingPage ?? true),
      };
    });
  } catch (e) {
    console.warn('[DataContext] Direct Supabase articles fetch notice:', e);
    return [];
  }
}

  // -------------------------------------------------------------
  // DATA FETCHING & SYNCHRONIZATION FROM SERVER BACKEND
  // -------------------------------------------------------------

  const loadDataFromServer = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    const token = getAdminToken();

    try {
      if (token) {
        // Admin is authenticated: load full dataset
        try {
          const adminData = await fetchAdminSiteData(true);
          setCameras(adminData.cameras);
          if (adminData.articles && adminData.articles.length > 0) {
            setArticles(adminData.articles);
          } else {
            const sbArticles = await fetchArticlesDirectFromSupabase();
            if (sbArticles.length > 0) {
              setArticles(sbArticles);
            }
          }
          setMediaAssets(adminData.mediaAssets);
          setSiteSettings(adminData.siteSettings);
          setHomeSettings(adminData.homeSettings);
          setAffiliateClicks(adminData.affiliateClicks);
          if (adminData.adminAccount) {
            setAdminAccount(adminData.adminAccount);
          }
          setPublishedVersion(adminData.published_version);
          setCachedPublishedVersion(adminData.published_version);
          return;
        } catch (adminErr: any) {
          // Token is expired or invalid - reset token and admin session cleanly
          setAdminUser(null);
          setAdminToken(null);
          try {
            localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
          } catch {}
          // Continue to fallback below (fetchPublishedSiteData)
        }
      }

      // Public visitor: fetch published database snapshot
      const pubData = await fetchPublishedSiteData();
      setCameras(pubData.cameras);
      if (pubData.articles && pubData.articles.length > 0) {
        setArticles(pubData.articles);
      } else {
        const sbArticles = await fetchArticlesDirectFromSupabase();
        if (sbArticles.length > 0) {
          setArticles(sbArticles);
        }
      }
      setSiteSettings(pubData.siteSettings);
      setHomeSettings(pubData.homeSettings);
      setPublishedVersion(pubData.published_version);
      setCachedPublishedVersion(pubData.published_version);
    } catch (err: any) {
      console.warn('[DataContext] Failed to fetch data from server, attempting direct Supabase query:', err?.message || err);
      try {
        const sbArticles = await fetchArticlesDirectFromSupabase();
        if (sbArticles.length > 0) {
          setArticles(sbArticles);
        }
      } catch {}
      setSyncError('Could not sync with server.');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadDataFromServer();
  }, [loadDataFromServer]);

  // Periodic polling & background version check (every 30 seconds & on tab focus)
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const ver = await checkPublishedVersion();
        if (ver.published_version > versionRef.current) {
          console.log(`[DataContext] New published version available: ${ver.published_version} (current: ${versionRef.current}). Revalidating.`);
          await loadDataFromServer();
        }
      } catch {
        // Ignore offline check
      }
    };

    const interval = setInterval(checkVersion, 30000);
    const onFocus = () => {
      checkVersion();
    };
    const onCmsPublishedUpdated = () => {
      loadDataFromServer();
    };
    const onAuthExpired = () => {
      console.warn('[DataContext] Session expired event caught. Resetting admin user state.');
      setAdminUser(null);
      setAdminToken(null);
      try {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
      } catch {}
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('cms:published-updated', onCmsPublishedUpdated);
    window.addEventListener('cms:auth-expired', onAuthExpired);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('cms:published-updated', onCmsPublishedUpdated);
      window.removeEventListener('cms:auth-expired', onAuthExpired);
    };
  }, [loadDataFromServer]);

  // -------------------------------------------------------------
  // ADMIN AUTHENTICATION
  // -------------------------------------------------------------

  const loginAdmin = async (emailInput: string, passwordInput: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await loginAdminApi(emailInput, passwordInput);
      setAdminUser(res.user);
      try {
        localStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, JSON.stringify(res.user));
      } catch (e) {
        console.error('Failed to save admin session', e);
      }
      // Re-load data as admin to get drafts and management fields
      await loadDataFromServer();
      // Notify builder
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Email atau kata sandi tidak sesuai. Gunakan akun khusus admin yang telah disediakan.',
      };
    }
  };

  const logoutAdmin = async () => {
    try {
      await logoutAdminApi();
    } catch {
      // Continue cleanup
    } finally {
      setAdminUser(null);
      setAdminToken(null);
      try {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
      } catch (e) {
        console.error('Failed to clear admin session', e);
      }
      // Re-load public data
      await loadDataFromServer();
      navigateTo('landing');
    }
  };

  const updateAdminAccount = async (updated: Partial<AdminAccountConfig>) => {
    try {
      const res = await updateAdminAccountApi(updated);
      setAdminAccount(res.account);
      if (adminUser) {
        const syncedUser: AdminUser = {
          ...adminUser,
          email: res.account.email,
          name: res.account.name,
          role: res.account.role,
          avatar: res.account.avatar,
        };
        setAdminUser(syncedUser);
        try {
          localStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, JSON.stringify(syncedUser));
        } catch (e) {
          console.error(e);
        }
      }
    } catch (err) {
      console.error('Failed to update admin account on server:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  };

  // -------------------------------------------------------------
  // NAVIGATION & URL HASH ROUTING
  // -------------------------------------------------------------

  const navigateTo = (view: string, slug?: string) => {
    setCurrentView(view);
    setActiveSlug(slug || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const cleanSlug = (str?: string) => (str || '').replace(/^\/+|\/+$/g, '').trim();
      const homeSlug = cleanSlug(siteSettings.homeSlug);
      const camerasSlug = cleanSlug(siteSettings.camerasSlug) || 'cameras';
      const blogSlug = cleanSlug(siteSettings.blogSlug) || 'blog';
      const cameraPrefix = cleanSlug(siteSettings.cameraSlugPrefix) || 'camera';
      const articlePrefix = cleanSlug(siteSettings.blogSlugPrefix) || 'article';

      let targetHash = '';
      if (view === 'article-detail' && slug) {
        targetHash = `#/${articlePrefix}/${slug}`;
      } else if (view === 'camera-detail' && slug) {
        targetHash = `#/${cameraPrefix}/${slug}`;
      } else if (view === 'landing') {
        targetHash = homeSlug ? `#/${homeSlug}` : '#/';
      } else if (view === 'cameras') {
        targetHash = `#/${camerasSlug}`;
      } else if (view === 'blog') {
        targetHash = `#/${blogSlug}`;
      } else {
        targetHash = `#/${view}`;
      }

      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      const parts = hash.split('/').filter(Boolean);

      const cleanSlug = (str?: string) => (str || '').replace(/^\/+|\/+$/g, '').trim().toLowerCase();
      const homeSlug = cleanSlug(siteSettings.homeSlug);
      const camerasSlug = cleanSlug(siteSettings.camerasSlug) || 'cameras';
      const blogSlug = cleanSlug(siteSettings.blogSlug) || 'blog';
      const cameraPrefix = cleanSlug(siteSettings.cameraSlugPrefix) || 'camera';
      const articlePrefix = cleanSlug(siteSettings.blogSlugPrefix) || 'article';

      if (parts.length === 0) {
        setCurrentView('landing');
        setActiveSlug(null);
        return;
      }

      const firstPart = (parts[0] || '').toLowerCase();

      if (firstPart === articlePrefix || firstPart === 'article' || firstPart === 'journal') {
        if (parts.length >= 2) {
          const slug = parts[1];
          const found = getArticleBySlug(slug);
          if (found) {
            setCurrentView('article-detail');
            setActiveSlug(found.slug);
            return;
          }
        }
      }

      if ((firstPart === cameraPrefix || firstPart === 'camera') && parts[1]) {
        setCurrentView('camera-detail');
        setActiveSlug(parts[1]);
        return;
      }

      if (firstPart === camerasSlug || firstPart === 'cameras') {
        setCurrentView('cameras');
        setActiveSlug(null);
      } else if (firstPart === blogSlug || firstPart === 'blog') {
        setCurrentView('blog');
        setActiveSlug(null);
      } else if (firstPart === homeSlug || firstPart === 'home' || firstPart === 'landing') {
        setCurrentView('landing');
        setActiveSlug(null);
      } else if (firstPart === 'comparisons') {
        setCurrentView('comparisons');
        setActiveSlug(null);
      } else if (firstPart === 'admin') {
        setCurrentView('admin');
        setActiveSlug(null);
      }
    };

    handleHashChange();
    window.addEventListener('popstate', handleHashChange);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handleHashChange);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [articles, siteSettings.blogSlugPrefix, siteSettings.homeSlug, siteSettings.camerasSlug, siteSettings.cameraSlugPrefix]);

  const toggleCompareCamera = (id: string) => {
    setComparedCameraIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 3) {
          return [prev[1], prev[2], id];
        }
        return [...prev, id];
      }
    });
  };

  // -------------------------------------------------------------
  // ARTICLES CRUD (PERSISTED TO PRODUCTION DATABASE)
  // -------------------------------------------------------------

  const saveArticle = async (article: Article): Promise<{ success: boolean; message: string }> => {
    const cleanSlug = (article.slug || article.title || '')
      .toLowerCase()
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');

    const sanitizedArticle: Article = {
      ...article,
      slug: cleanSlug,
      updatedAt: new Date().toISOString().split('T')[0],
      publishedAt: article.publishedAt || new Date().toISOString().split('T')[0],
    };

    try {
      const res = await saveArticleApi(sanitizedArticle);
      setArticles((prev) => {
        const idx = prev.findIndex((a) => a.id === res.article.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = res.article;
          return updated;
        }
        return [res.article, ...prev];
      });
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true, message: 'Changes published successfully.' };
    } catch (err: any) {
      console.warn('[DataContext] Primary saveArticle API failed, executing direct Supabase upsert fallback:', err);
      try {
        const authorStr = typeof sanitizedArticle.author === 'string'
          ? sanitizedArticle.author
          : (sanitizedArticle.author?.name || 'FujiFinder Editorial');

        const payload = {
          id: sanitizedArticle.id,
          slug: sanitizedArticle.slug,
          title: sanitizedArticle.title,
          category: sanitizedArticle.category,
          status: sanitizedArticle.status || 'published',
          author: authorStr,
          subtitle: sanitizedArticle.subtitle || null,
          excerpt: sanitizedArticle.excerpt || null,
          featured: Boolean(sanitizedArticle.featured),
          cover_image: sanitizedArticle.coverImage || null,
          read_time_minutes: sanitizedArticle.readTimeMinutes || 5,
          blocks: sanitizedArticle.blocks || [],
          seo: sanitizedArticle.seo || {},
          related_camera_id: sanitizedArticle.featuredCameraIds?.[0] || null,
          tags: sanitizedArticle.seo?.secondaryKeywords || [],
          view_count: sanitizedArticle.views || 0,
          published_at: sanitizedArticle.publishedAt || new Date().toISOString(),
          data: sanitizedArticle,
          updated_at: new Date().toISOString(),
        };

        const { error: sbErr } = await supabase.from('articles').upsert(payload, { onConflict: 'id' });
        if (sbErr) throw sbErr;

        setArticles((prev) => {
          const idx = prev.findIndex((a) => a.id === sanitizedArticle.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = sanitizedArticle;
            return updated;
          }
          return [sanitizedArticle, ...prev];
        });
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
        return { success: true, message: 'Artikel berhasil disimpan ke Supabase database.' };
      } catch (sbError: any) {
        console.error('[DataContext] Direct Supabase save fallback also failed:', sbError);
        throw new Error(err.message || sbError.message || 'Perubahan artikel gagal disimpan. Silakan coba lagi.');
      }
    }
  };

  const deleteArticle = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      await deleteArticleApi(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true, message: 'Changes published successfully.' };
    } catch (err: any) {
      console.warn('[DataContext] Primary deleteArticle API failed, attempting direct Supabase delete fallback:', err);
      try {
        const { error: sbErr } = await supabase.from('articles').delete().eq('id', id);
        if (sbErr) throw sbErr;
        setArticles((prev) => prev.filter((a) => a.id !== id));
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
        return { success: true, message: 'Artikel berhasil dihapus dari database.' };
      } catch (sbError: any) {
        console.error('[DataContext] Direct Supabase delete fallback failed:', sbError);
        throw new Error(err.message || sbError.message || 'Gagal menghapus artikel. Silakan coba lagi.');
      }
    }
  };

  const togglePublishArticle = async (id: string): Promise<{ success: boolean; message: string }> => {
    const target = articles.find((a) => a.id === id);
    if (!target) return { success: false, message: 'Article not found' };

    const updated: Article = {
      ...target,
      status: target.status === 'published' ? 'draft' : 'published',
      updatedAt: new Date().toISOString().split('T')[0],
    };

    return saveArticle(updated);
  };

  const getArticleBySlug = (slugOrId: string) => {
    if (!slugOrId) return undefined;
    const clean = (slugOrId || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return (
      articles.find((a) => (a.slug || '').toLowerCase() === clean) ||
      articles.find((a) => a.id === slugOrId) ||
      articles.find((a) => (a.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '') === clean.replace(/[^a-z0-9]/g, ''))
    );
  };

  // -------------------------------------------------------------
  // CAMERAS CRUD (PERSISTED TO PRODUCTION DATABASE)
  // -------------------------------------------------------------

  const saveCamera = async (camera: CameraProduct): Promise<{ success: boolean; message: string }> => {
    const cameraWithStatus: CameraProduct = {
      ...camera,
      status: camera.status || 'published',
    };

    try {
      const res = await saveCameraApi(cameraWithStatus);
      setCameras((prev) => {
        const idx = prev.findIndex((c) => c.id === res.camera.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = res.camera;
          return updated;
        }
        return [res.camera, ...prev];
      });
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true, message: 'Changes published successfully.' };
    } catch (err: any) {
      console.error('Failed to save camera to backend:', err);
      throw new Error(err.message || 'Perubahan kamera gagal disimpan. Silakan coba lagi.');
    }
  };

  const toggleCameraStatus = async (id: string): Promise<{ success: boolean; message: string }> => {
    const cam = cameras.find((c) => c.id === id);
    if (!cam) return { success: false, message: 'Camera not found' };

    const newStatus = (cam.status ?? 'published') === 'published' ? 'draft' : 'published';
    return saveCamera({ ...cam, status: newStatus });
  };

  const deleteCamera = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      await deleteCameraApi(id);
      setCameras((prev) => prev.filter((c) => c.id !== id));
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true, message: 'Changes published successfully.' };
    } catch (err: any) {
      console.error('Failed to delete camera on backend:', err);
      throw new Error(err.message || 'Gagal menghapus kamera. Silakan coba lagi.');
    }
  };

  const getCameraBySlug = (slug: string) => {
    return cameras.find((c) => c.slug === slug);
  };

  const getCameraById = (id: string) => {
    return cameras.find((c) => c.id === id);
  };

  // -------------------------------------------------------------
  // AFFILIATE MANAGEMENT
  // -------------------------------------------------------------

  const updateAffiliateLink = (productId: string, linkId: string, newUrl: string, newPrice?: number, inStock?: boolean) => {
    const cam = cameras.find((c) => c.id === productId);
    if (!cam) return;

    const updatedCam: CameraProduct = {
      ...cam,
      affiliateLinks: cam.affiliateLinks.map((link) => {
        if (link.id !== linkId) return link;
        return {
          ...link,
          url: newUrl,
          price: newPrice !== undefined ? newPrice : link.price,
          inStock: inStock !== undefined ? inStock : link.inStock,
        };
      }),
    };

    saveCamera(updatedCam).catch((err) => console.error('Failed to sync affiliate link update:', err));
  };

  const recordAffiliateClick = (
    productId: string,
    retailer: string,
    sourceType: 'article' | 'product_page' | 'comparison' | 'landing_card' | 'quick_finder',
    sourceSlug?: string
  ) => {
    const product = cameras.find((c) => c.id === productId);
    const log: AffiliateClickLog = {
      id: 'click-' + Date.now(),
      productId,
      productName: product?.name || 'Camera Gear',
      retailer,
      sourceType,
      sourceSlug,
      timestamp: new Date().toLocaleString(),
    };

    setAffiliateClicks((prev) => [log, ...prev.slice(0, 199)]);
    recordAffiliateClickApi(log);

    if (sourceType === 'article' && sourceSlug) {
      setArticles((prev) =>
        prev.map((art) =>
          art.slug === sourceSlug ? { ...art, affiliateClicks: (art.affiliateClicks || 0) + 1 } : art
        )
      );
    }
  };

  // -------------------------------------------------------------
  // MEDIA & SETTINGS CRUD
  // -------------------------------------------------------------

  const addMediaAsset = async (asset: Omit<MediaAsset, 'id' | 'uploadedAt'>): Promise<void> => {
    const newAsset: MediaAsset = {
      ...asset,
      id: 'm-' + Date.now(),
      uploadedAt: new Date().toISOString().split('T')[0],
    };

    try {
      const res = await addMediaAssetApi(newAsset);
      setMediaAssets((prev) => [res.asset, ...prev]);
    } catch (err) {
      console.error('Failed to add media asset on backend:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  };

  const deleteMediaAsset = async (id: string): Promise<void> => {
    try {
      await deleteMediaAssetApi(id);
      setMediaAssets((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete media asset on backend:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  };

  const updateSiteSettings = async (settings: Partial<SiteSettings>): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await updateSiteSettingsApi(settings);
      setSiteSettings(res.siteSettings);
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true, message: 'Changes published successfully.' };
    } catch (err) {
      console.error('Failed to update site settings on backend:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  };

  const updateHomeSettings = async (settings: Partial<HomePageSettings>): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await updateHomeSettingsApi(settings);
      setHomeSettings(res.homeSettings);
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
      return { success: true, message: 'Changes published successfully.' };
    } catch (err) {
      console.error('Failed to update home settings on backend:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  };

  const resetToDemoData = async (): Promise<void> => {
    try {
      await resetSiteToDemoApi();
      await loadDataFromServer();
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
    } catch (err) {
      console.error('Failed to reset site to demo on backend:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  };

  return (
    <DataContext.Provider
      value={{
        cameras,
        articles,
        mediaAssets,
        siteSettings,
        homeSettings,
        affiliateClicks,
        currentView,
        activeSlug,
        adminTab,
        editingArticleId,
        editingCameraId,
        comparedCameraIds,
        searchModalOpen,
        searchQuery,
        selectedCategory,
        // Synchronization status
        publishedVersion,
        isSyncing,
        syncError,
        refreshData: loadDataFromServer,
        // Admin Auth
        adminUser,
        isAdminLoggedIn,
        adminAccount,
        loginAdmin,
        logoutAdmin,
        updateAdminAccount,
        navigateTo,
        setAdminTab,
        setEditingArticleId,
        setEditingCameraId,
        setComparedCameraIds,
        toggleCompareCamera,
        setSearchModalOpen,
        setSearchQuery,
        setSelectedCategory,
        saveArticle,
        deleteArticle,
        togglePublishArticle,
        getArticleBySlug,
        saveCamera,
        deleteCamera,
        toggleCameraStatus,
        getCameraBySlug,
        getCameraById,
        updateAffiliateLink,
        recordAffiliateClick,
        addMediaAsset,
        deleteMediaAsset,
        updateSiteSettings,
        updateHomeSettings,
        resetToDemoData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
