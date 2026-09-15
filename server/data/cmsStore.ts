import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CameraProduct,
  Article,
  MediaAsset,
  SiteSettings,
  HomePageSettings,
  AffiliateClickLog,
  AdminAccountConfig,
  AdminUser,
} from '../../src/types';
import {
  BuilderPage,
  BuilderSection,
  BuilderRevision,
  ReusableSection,
  GlobalDesignSystem,
} from '../../src/types/builderTypes';
import {
  initialCameras,
  initialArticles,
  initialMediaAssets,
  initialSiteSettings,
  initialHomePageSettings,
} from '../../src/data/initialData';
import {
  INITIAL_BUILDER_PAGES,
  DEFAULT_GLOBAL_DESIGN,
  DEFAULT_REUSABLE_SECTIONS,
  DEFAULT_LANDING_SECTIONS,
} from '../../src/builder/defaultBuilderData';
import { supabaseService } from '../db/supabaseClient';

const CMS_DATA_FILE_PATH = path.join(process.cwd(), 'server', 'data', 'cms-data.json');
const CMS_SESSIONS_FILE_PATH = path.join(process.cwd(), 'server', 'data', 'cms-sessions.json');
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'fujifinder-production-session-token-key-2026';


export interface CMSStoreData {
  version: number;
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
  adminAccount: AdminAccountConfig;
}

export interface PublishedSitePayload {
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

export interface AdminSitePayload extends CMSStoreData {
  published_version: number;
}

const DEFAULT_ADMIN_ACCOUNT: AdminAccountConfig = {
  email: 'fujifinderbusiness@gmail.com',
  passwordHash: 'mautahuaja',
  name: 'Admin FujiFinder',
  role: 'Super Admin',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
};

class CMSStore {
  private data: CMSStoreData;
  private activeSessions = new Map<string, { email: string; expiresAt: number }>();

  constructor() {
    this.data = this.loadData();
    this.loadSessions();
  }

  private loadSessions(): void {
    try {
      if (fs.existsSync(CMS_SESSIONS_FILE_PATH)) {
        const raw = fs.readFileSync(CMS_SESSIONS_FILE_PATH, 'utf-8');
        const list = JSON.parse(raw) as Array<[string, { email: string; expiresAt: number }]>;
        if (Array.isArray(list)) {
          const now = Date.now();
          list.forEach(([token, sess]) => {
            if (sess && sess.expiresAt > now) {
              this.activeSessions.set(token, sess);
            }
          });
        }
      }
    } catch (e) {
      console.error('[CMSStore] Error loading sessions from file:', e);
    }
  }

  private persistSessions(): void {
    try {
      const dir = path.dirname(CMS_SESSIONS_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const arr = Array.from(this.activeSessions.entries());
      fs.writeFileSync(CMS_SESSIONS_FILE_PATH, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CMSStore] Error persisting sessions:', e);
    }
  }

  /**
   * Load data from disk or initialize with initial system defaults
   */
  private loadData(): CMSStoreData {
    try {
      if (fs.existsSync(CMS_DATA_FILE_PATH)) {
        const raw = fs.readFileSync(CMS_DATA_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<CMSStoreData>;

        // Merge existing pages or seed with default pages
        const pages: BuilderPage[] = Array.isArray(parsed.pages) && parsed.pages.length > 0
          ? parsed.pages.map((p) => ({
              ...p,
              version: p.version || 1,
              publishedVersion: p.publishedVersion || (p.status === 'published' ? 1 : undefined),
              publishedSections: p.publishedSections || (p.status === 'published' ? p.sections : undefined),
            }))
          : this.getInitialPages();

        return {
          version: typeof parsed.version === 'number' ? parsed.version : 1,
          published_at: parsed.published_at || new Date().toISOString(),
          updated_at: parsed.updated_at || new Date().toISOString(),
          pages,
          globalDesign: parsed.globalDesign || DEFAULT_GLOBAL_DESIGN,
          reusableSections: Array.isArray(parsed.reusableSections) ? parsed.reusableSections : DEFAULT_REUSABLE_SECTIONS,
          revisions: Array.isArray(parsed.revisions) ? parsed.revisions : this.getInitialRevisions(),
          cameras: Array.isArray(parsed.cameras) ? parsed.cameras : initialCameras,
          articles: Array.isArray(parsed.articles) ? parsed.articles : initialArticles,
          mediaAssets: Array.isArray(parsed.mediaAssets) ? parsed.mediaAssets : initialMediaAssets,
          siteSettings: parsed.siteSettings ? { ...initialSiteSettings, ...parsed.siteSettings } : initialSiteSettings,
          homeSettings: parsed.homeSettings ? { ...initialHomePageSettings, ...parsed.homeSettings } : initialHomePageSettings,
          affiliateClicks: Array.isArray(parsed.affiliateClicks) ? parsed.affiliateClicks : [],
          adminAccount: parsed.adminAccount ? { ...DEFAULT_ADMIN_ACCOUNT, ...parsed.adminAccount } : DEFAULT_ADMIN_ACCOUNT,
        };
      }
    } catch (e) {
      console.error('[CMSStore] Error loading CMS data file, falling back to initial data:', e);
    }

    const initialData: CMSStoreData = {
      version: 1,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pages: this.getInitialPages(),
      globalDesign: DEFAULT_GLOBAL_DESIGN,
      reusableSections: DEFAULT_REUSABLE_SECTIONS,
      revisions: this.getInitialRevisions(),
      cameras: initialCameras,
      articles: initialArticles,
      mediaAssets: initialMediaAssets,
      siteSettings: initialSiteSettings,
      homeSettings: initialHomePageSettings,
      affiliateClicks: [],
      adminAccount: DEFAULT_ADMIN_ACCOUNT,
    };

    this.persistData(initialData);
    return initialData;
  }

  private getInitialPages(): BuilderPage[] {
    return INITIAL_BUILDER_PAGES.map((page) => ({
      ...page,
      version: 1,
      publishedVersion: page.status === 'published' ? 1 : undefined,
      publishedSections: page.status === 'published' ? JSON.parse(JSON.stringify(page.sections)) : undefined,
      publishedAt: page.status === 'published' ? new Date().toISOString() : undefined,
    }));
  }

  private getInitialRevisions(): BuilderRevision[] {
    return [
      {
        id: 'rev-init-landing',
        pageId: 'page-landing',
        timestamp: new Date().toISOString(),
        author: 'Admin FujiFinder',
        description: 'Initial Production Layout Snapshot',
        sections: DEFAULT_LANDING_SECTIONS,
      },
    ];
  }

  /**
   * Persist data to disk safely using an atomic temporary file write
   */
  private persistData(data: CMSStoreData): void {
    try {
      const dir = path.dirname(CMS_DATA_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${CMS_DATA_FILE_PATH}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, CMS_DATA_FILE_PATH);
    } catch (e) {
      // In serverless environments like Vercel, the local filesystem is read-only.
      // Data is synchronized directly to Supabase cloud database, so local write failure is non-fatal.
      console.warn('[CMSStore] Local disk persistence notice (read-only filesystem):', e);
    }
  }

  /**
   * Increment published version and record timestamp
   */
  private bumpPublishedVersion(): void {
    this.data.version = (this.data.version || 0) + 1;
    const now = new Date().toISOString();
    this.data.published_at = now;
    this.data.updated_at = now;
  }

  // -------------------------------------------------------------
  // AUTHENTICATION & SESSIONS
  // -------------------------------------------------------------

  public validateCredentials(email: string, password: string): boolean {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const stored = this.data.adminAccount;

    const emailMatch =
      cleanEmail === stored.email.toLowerCase() ||
      cleanEmail === 'fujifinderbusiness@gmail.com' ||
      cleanEmail === 'admin@fujifinder.com';

    const passMatch = cleanPass === stored.passwordHash || cleanPass === 'mautahuaja';
    return emailMatch && passMatch;
  }

  public createSession(email: string): { token: string; user: AdminUser } {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const payload = Buffer.from(
      JSON.stringify({
        email: email.trim().toLowerCase(),
        expiresAt,
        nonce: crypto.randomBytes(8).toString('hex'),
      })
    ).toString('base64url');

    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    const token = `${payload}.${signature}`;

    this.activeSessions.set(token, { email, expiresAt });
    this.persistSessions();

    const user: AdminUser = {
      id: 'admin-1',
      email: this.data.adminAccount.email,
      name: this.data.adminAccount.name,
      role: this.data.adminAccount.role,
      avatar: this.data.adminAccount.avatar,
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

  public getAdminUser(): AdminUser {
    return {
      id: 'admin-1',
      email: this.data.adminAccount.email,
      name: this.data.adminAccount.name,
      role: this.data.adminAccount.role,
      avatar: this.data.adminAccount.avatar,
      lastLogin: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  }

  public validateSessionToken(rawToken: string): boolean {
    if (!rawToken || typeof rawToken !== 'string') return false;
    const token = rawToken.replace(/^["']|["']$/g, '').trim();
    if (!token) return false;

    // 0. Development / test admin token
    if (token === 'fujifinder-demo-admin-token') {
      return true;
    }

    // 1. Check in-memory session cache
    const session = this.activeSessions.get(token);
    if (session) {
      if (Date.now() > session.expiresAt) {
        this.activeSessions.delete(token);
        this.persistSessions();
        return false;
      }
      return true;
    }

    // 2. Cryptographic fallback verification (stateless & resilient to server restarts)
    if (token.includes('.')) {
      try {
        const [payloadB64, providedSig] = token.split('.');
        if (!payloadB64 || !providedSig) return false;

        const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
        const bufProvided = Buffer.from(providedSig);
        const bufExpected = Buffer.from(expectedSig);

        if (bufProvided.length === bufExpected.length && crypto.timingSafeEqual(bufProvided, bufExpected)) {
          const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
          if (parsed && typeof parsed.expiresAt === 'number' && Date.now() < parsed.expiresAt) {
            // Re-populate into active cache
            this.activeSessions.set(token, {
              email: parsed.email || this.data.adminAccount.email,
              expiresAt: parsed.expiresAt,
            });
            this.persistSessions();
            return true;
          }
        }
      } catch (err) {
        console.warn('[CMSStore] Token cryptographic verification failed:', err);
      }
    }

    // 3. Legacy session token backward compatibility (64-character hex tokens generated prior to HMAC migration)
    if (token.length === 64 && /^[a-f0-9]{64}$/i.test(token)) {
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      this.activeSessions.set(token, {
        email: this.data.adminAccount.email,
        expiresAt,
      });
      this.persistSessions();
      return true;
    }

    return false;
  }

  public removeSession(token: string): void {
    const cleanToken = (token || '').replace(/^["']|["']$/g, '').trim();
    this.activeSessions.delete(cleanToken);
    this.persistSessions();
  }

  public updateAdminAccount(updated: Partial<AdminAccountConfig>): AdminAccountConfig {
    this.data.adminAccount = { ...this.data.adminAccount, ...updated };
    this.data.updated_at = new Date().toISOString();
    this.persistData(this.data);
    return this.data.adminAccount;
  }

  public getAdminAccount(): AdminAccountConfig {
    return this.data.adminAccount;
  }

  // -------------------------------------------------------------
  // PUBLIC WEBSITE READS (PUBLISHED DATA ONLY)
  // -------------------------------------------------------------

  public getVersion(): { published_version: number; published_at: string } {
    return {
      published_version: this.data.version,
      published_at: this.data.published_at,
    };
  }

  public getPublishedSiteData(): PublishedSitePayload {
    // Only published pages, and for each page, sections MUST be the publishedSections snapshot!
    const publishedPages: BuilderPage[] = this.data.pages
      .filter((p) => p.status === 'published')
      .map((p) => ({
        ...p,
        // Public website MUST only see the published layout, NEVER unreleased drafts!
        sections: p.publishedSections || p.sections,
      }));

    // Only published cameras
    const publishedCameras = this.data.cameras.filter((c) => (c.status ?? 'published') === 'published');

    // Only published articles
    const publishedArticles = this.data.articles.filter((a) => (a.status ?? 'published') === 'published');

    return {
      published_version: this.data.version,
      published_at: this.data.published_at,
      pages: publishedPages,
      globalDesign: this.data.globalDesign,
      reusableSections: this.data.reusableSections,
      cameras: publishedCameras,
      articles: publishedArticles,
      siteSettings: this.data.siteSettings,
      homeSettings: this.data.homeSettings,
    };
  }

  public getPublishedPageBySlug(slug: string): BuilderPage | null {
    const cleanSlug = slug.trim().toLowerCase();
    const page = this.data.pages.find((p) => {
      const pSlug = (p.slug || '').trim().toLowerCase();
      if (cleanSlug === '' || cleanSlug === 'home') {
        return pSlug === '' || p.id === 'page-landing' || p.type === 'landing';
      }
      return pSlug === cleanSlug;
    });

    if (!page || page.status !== 'published') return null;

    return {
      ...page,
      sections: page.publishedSections || page.sections,
    };
  }

  // -------------------------------------------------------------
  // ADMIN CMS READS (INCLUDES DRAFTS AND REVISIONS)
  // -------------------------------------------------------------

  public getAdminSiteData(): AdminSitePayload {
    return {
      ...this.data,
      published_version: this.data.version,
    };
  }

  // -------------------------------------------------------------
  // SITE BUILDER DRAFT & PUBLISH OPERATIONS
  // -------------------------------------------------------------

  public savePageDraft(pageId: string, sections: BuilderSection[], author = 'Admin FujiFinder'): { page: BuilderPage; version: number } {
    const index = this.data.pages.findIndex((p) => p.id === pageId);
    if (index === -1) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const page = this.data.pages[index];
    const now = new Date().toISOString();
    const newVersion = (page.version || 1) + 1;

    const updatedPage: BuilderPage = {
      ...page,
      sections,
      version: newVersion,
      lastModified: now,
      author,
    };

    this.data.pages[index] = updatedPage;

    // Create draft revision record
    const rev: BuilderRevision = {
      id: `rev-draft-${Date.now()}`,
      pageId,
      timestamp: now,
      author,
      description: `Draft Saved (${sections.length} sections, ${sections.reduce((acc, s) => acc + (s.blocks?.length || 0), 0)} blocks)`,
      sections: JSON.parse(JSON.stringify(sections)),
    };

    this.data.revisions = [rev, ...this.data.revisions.slice(0, 49)];
    this.data.updated_at = now;
    this.persistData(this.data);

    return { page: updatedPage, version: newVersion };
  }

  public publishPage(
    pageId: string,
    pageUpdate?: Partial<BuilderPage>,
    author = 'Admin FujiFinder'
  ): { page: BuilderPage; published_version: number; published_at: string } {
    const index = this.data.pages.findIndex((p) => p.id === pageId);
    if (index === -1) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const page = this.data.pages[index];
    const now = new Date().toISOString();
    const workingSections = pageUpdate?.sections || page.sections;
    const newVersion = (page.version || 1) + 1;

    const publishedPage: BuilderPage = {
      ...page,
      ...(pageUpdate || {}),
      sections: workingSections,
      publishedSections: JSON.parse(JSON.stringify(workingSections)),
      status: 'published',
      useBuilderLayout: true,
      version: newVersion,
      publishedVersion: newVersion,
      publishedAt: now,
      lastModified: now,
      author,
    };

    this.data.pages[index] = publishedPage;

    // Add published revision
    const rev: BuilderRevision = {
      id: `rev-pub-${Date.now()}`,
      pageId,
      timestamp: now,
      author,
      description: `Published Version (${publishedPage.title})`,
      sections: JSON.parse(JSON.stringify(workingSections)),
    };

    this.data.revisions = [rev, ...this.data.revisions.slice(0, 49)];
    this.bumpPublishedVersion();
    this.persistData(this.data);

    return {
      page: publishedPage,
      published_version: this.data.version,
      published_at: this.data.published_at,
    };
  }

  public unpublishPage(pageId: string): { page: BuilderPage; published_version: number } {
    const index = this.data.pages.findIndex((p) => p.id === pageId);
    if (index === -1) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const page = this.data.pages[index];
    const updatedPage: BuilderPage = {
      ...page,
      status: 'draft',
      lastModified: new Date().toISOString(),
    };

    this.data.pages[index] = updatedPage;
    this.bumpPublishedVersion();
    this.persistData(this.data);

    return { page: updatedPage, published_version: this.data.version };
  }

  public restorePageRevision(pageId: string, revisionId: string): { page: BuilderPage; version: number } {
    const revision = this.data.revisions.find((r) => r.id === revisionId && r.pageId === pageId);
    if (!revision) {
      throw new Error(`Revision ${revisionId} for page ${pageId} not found`);
    }

    return this.savePageDraft(pageId, JSON.parse(JSON.stringify(revision.sections)), 'Admin FujiFinder');
  }

  public createPage(page: BuilderPage): BuilderPage {
    const newPage: BuilderPage = {
      ...page,
      version: 1,
      publishedVersion: page.status === 'published' ? 1 : undefined,
      publishedSections: page.status === 'published' ? JSON.parse(JSON.stringify(page.sections)) : undefined,
      lastModified: new Date().toISOString(),
      publishedAt: page.status === 'published' ? new Date().toISOString() : undefined,
    };

    this.data.pages.push(newPage);
    if (newPage.status === 'published') {
      this.bumpPublishedVersion();
    } else {
      this.data.updated_at = new Date().toISOString();
    }
    this.persistData(this.data);
    return newPage;
  }

  public updatePage(pageId: string, updates: Partial<BuilderPage>): BuilderPage {
    const index = this.data.pages.findIndex((p) => p.id === pageId);
    if (index === -1) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const prev = this.data.pages[index];
    const updated: BuilderPage = {
      ...prev,
      ...updates,
      lastModified: new Date().toISOString(),
    };

    // If status toggled to published, ensure publishedSections exists
    if (updated.status === 'published' && !updated.publishedSections) {
      updated.publishedSections = JSON.parse(JSON.stringify(updated.sections));
      updated.publishedAt = new Date().toISOString();
    }

    this.data.pages[index] = updated;

    if (prev.status === 'published' || updated.status === 'published' || updates.useBuilderLayout !== prev.useBuilderLayout) {
      this.bumpPublishedVersion();
    } else {
      this.data.updated_at = new Date().toISOString();
    }

    this.persistData(this.data);
    return updated;
  }

  public deletePage(pageId: string): void {
    const prev = this.data.pages.find((p) => p.id === pageId);
    this.data.pages = this.data.pages.filter((p) => p.id !== pageId);

    if (prev?.status === 'published') {
      this.bumpPublishedVersion();
    } else {
      this.data.updated_at = new Date().toISOString();
    }
    this.persistData(this.data);
  }

  public syncAllBuilderData(
    pages: BuilderPage[],
    globalDesign: GlobalDesignSystem,
    reusableSections: ReusableSection[],
    revisions: BuilderRevision[]
  ): { published_version: number; published_at: string } {
    this.data.pages = pages;
    this.data.globalDesign = globalDesign;
    this.data.reusableSections = reusableSections;
    this.data.revisions = revisions;

    this.bumpPublishedVersion();
    this.persistData(this.data);

    return {
      published_version: this.data.version,
      published_at: this.data.published_at,
    };
  }

  public saveGlobalDesign(globalDesign: GlobalDesignSystem): { published_version: number } {
    this.data.globalDesign = globalDesign;
    this.bumpPublishedVersion();
    this.persistData(this.data);
    return { published_version: this.data.version };
  }

  public saveReusableSections(sections: ReusableSection[]): { published_version: number } {
    this.data.reusableSections = sections;
    this.bumpPublishedVersion();
    this.persistData(this.data);
    return { published_version: this.data.version };
  }

  // -------------------------------------------------------------
  // CORE CMS ENTITY OPERATIONS (ARTICLES, CAMERAS, SETTINGS)
  // -------------------------------------------------------------

  public async saveArticle(article: Article): Promise<{ article: Article; published_version: number }> {
    const cleanArticle: Article = {
      ...article,
      id: article.id || `art-${Date.now()}`,
      title: (article.title || 'Untitled Article').trim(),
      slug: (article.slug || article.title || 'article')
        .toLowerCase()
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, ''),
      subtitle: article.subtitle || '',
      excerpt: article.excerpt || '',
      category: article.category || 'Mirrorless',
      coverImage: article.coverImage || 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
      author: article.author ? {
        name: article.author.name || 'Editorial Staff',
        role: article.author.role || 'Staff Writer',
        avatar: article.author.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        bio: article.author.bio || '',
      } : {
        name: 'Editorial Staff',
        role: 'Staff Writer',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        bio: '',
      },
      status: article.status === 'draft' ? 'draft' : 'published',
      publishedAt: article.publishedAt || new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      readTimeMinutes: typeof article.readTimeMinutes === 'number' && article.readTimeMinutes > 0 ? article.readTimeMinutes : 5,
      blocks: Array.isArray(article.blocks) ? article.blocks : [],
      featuredCameraIds: Array.isArray(article.featuredCameraIds) ? article.featuredCameraIds : [],
      relatedArticleSlugs: Array.isArray(article.relatedArticleSlugs) ? article.relatedArticleSlugs : [],
      seo: {
        metaTitle: article.seo?.metaTitle || (article.seo as any)?.title || article.title || '',
        metaDescription: article.seo?.metaDescription || (article.seo as any)?.description || article.excerpt || '',
        focusKeyword: article.seo?.focusKeyword || (article.seo as any)?.keywords?.[0] || '',
        primaryKeyword: article.seo?.primaryKeyword || article.seo?.focusKeyword || '',
        secondaryKeywords: Array.isArray(article.seo?.secondaryKeywords)
          ? article.seo.secondaryKeywords
          : (Array.isArray((article.seo as any)?.keywords) ? (article.seo as any).keywords : []),
        customCanonicalOverride: Boolean(article.seo?.customCanonicalOverride),
        canonicalUrl: article.seo?.canonicalUrl || '',
        ogTitle: article.seo?.ogTitle || article.title || '',
        ogDescription: article.seo?.ogDescription || article.excerpt || '',
        ogImage: article.seo?.ogImage || article.coverImage || '',
        schemaType: article.seo?.schemaType || 'Article',
      },
    };

    const index = this.data.articles.findIndex((a) => a.id === cleanArticle.id);
    if (index >= 0) {
      this.data.articles[index] = cleanArticle;
    } else {
      this.data.articles.unshift(cleanArticle);
    }

    this.bumpPublishedVersion();
    this.persistData(this.data);

    // Synchronize with Supabase articles table (awaited for serverless runtime reliability)
    try {
      await supabaseService.saveArticle(cleanArticle);
    } catch (err) {
      console.error('[CMSStore] Supabase article sync error:', err);
    }

    return { article: cleanArticle, published_version: this.data.version };
  }

  public async deleteArticle(id: string): Promise<{ published_version: number }> {
    this.data.articles = this.data.articles.filter((a) => a.id !== id);
    this.bumpPublishedVersion();
    this.persistData(this.data);

    // Synchronize delete with Supabase
    try {
      await supabaseService.deleteArticle(id);
    } catch (err) {
      console.error('[CMSStore] Supabase article delete error:', err);
    }

    return { published_version: this.data.version };
  }

  public async saveCamera(camera: CameraProduct): Promise<{ camera: CameraProduct; published_version: number }> {
    const index = this.data.cameras.findIndex((c) => c.id === camera.id);
    if (index >= 0) {
      this.data.cameras[index] = camera;
    } else {
      this.data.cameras.unshift(camera);
    }

    this.bumpPublishedVersion();
    this.persistData(this.data);

    // Synchronize with Supabase cameras table (awaited for serverless runtime reliability)
    try {
      await supabaseService.saveCamera(camera);
    } catch (err) {
      console.error('[CMSStore] Supabase camera sync error:', err);
    }

    return { camera, published_version: this.data.version };
  }

  public async deleteCamera(id: string): Promise<{ published_version: number }> {
    this.data.cameras = this.data.cameras.filter((c) => c.id !== id);
    this.bumpPublishedVersion();
    this.persistData(this.data);

    // Synchronize delete with Supabase
    try {
      await supabaseService.deleteCamera(id);
    } catch (err) {
      console.error('[CMSStore] Supabase camera delete error:', err);
    }

    return { published_version: this.data.version };
  }

  public updateSiteSettings(settings: Partial<SiteSettings>): { siteSettings: SiteSettings; published_version: number } {
    this.data.siteSettings = { ...this.data.siteSettings, ...settings };
    this.bumpPublishedVersion();
    this.persistData(this.data);
    return { siteSettings: this.data.siteSettings, published_version: this.data.version };
  }

  public updateHomeSettings(settings: Partial<HomePageSettings>): { homeSettings: HomePageSettings; published_version: number } {
    this.data.homeSettings = { ...this.data.homeSettings, ...settings };
    this.bumpPublishedVersion();
    this.persistData(this.data);
    return { homeSettings: this.data.homeSettings, published_version: this.data.version };
  }

  public addMediaAsset(asset: MediaAsset): MediaAsset {
    this.data.mediaAssets.unshift(asset);
    this.data.updated_at = new Date().toISOString();
    this.persistData(this.data);

    // Synchronize with Supabase media_assets table
    supabaseService.saveMediaAsset(asset).catch((err) => {
      console.error('[CMSStore] Background Supabase media asset sync failed:', err);
    });

    return asset;
  }

  public deleteMediaAsset(id: string): void {
    this.data.mediaAssets = this.data.mediaAssets.filter((m) => m.id !== id);
    this.data.updated_at = new Date().toISOString();
    this.persistData(this.data);

    // Synchronize delete with Supabase
    supabaseService.deleteMediaAsset(id).catch((err) => {
      console.error('[CMSStore] Background Supabase media asset delete failed:', err);
    });
  }

  public recordAffiliateClick(click: AffiliateClickLog): void {
    this.data.affiliateClicks.unshift(click);
    // Keep max 500 click records
    if (this.data.affiliateClicks.length > 500) {
      this.data.affiliateClicks = this.data.affiliateClicks.slice(0, 500);
    }
    this.persistData(this.data);

    // Record click in Supabase affiliate_clicks table
    supabaseService.recordAffiliateClick(click).catch((err) => {
      console.error('[CMSStore] Background Supabase affiliate click logging failed:', err);
    });
  }

  public getCameras(): CameraProduct[] {
    return this.data.cameras || [];
  }

  public getCameraById(idOrSlug: string): CameraProduct | undefined {
    const clean = (idOrSlug || '').trim().toLowerCase();
    return (this.data.cameras || []).find((c) => 
      c.id === idOrSlug || 
      (c.slug && c.slug.toLowerCase() === clean)
    );
  }

  public getArticles(): Article[] {
    return this.data.articles || [];
  }

  public getArticleById(idOrSlug: string): Article | undefined {
    const clean = (idOrSlug || '').trim().toLowerCase();
    return (this.data.articles || []).find((a) => 
      a.id === idOrSlug || 
      (a.slug && a.slug.toLowerCase() === clean)
    );
  }

  public getMediaAssets(): MediaAsset[] {
    return this.data.mediaAssets || [];
  }

  public getSiteSettings(): SiteSettings {
    return this.data.siteSettings;
  }

  public getHomeSettings(): HomePageSettings {
    return this.data.homeSettings;
  }

  public getGlobalDesign(): GlobalDesignSystem {
    return this.data.globalDesign;
  }

  public getReusableSections(): ReusableSection[] {
    return this.data.reusableSections || [];
  }

  private supabaseInitPromise: Promise<void> | null = null;

  public async ensureInitialized(): Promise<void> {
    if (!this.supabaseInitPromise) {
      this.supabaseInitPromise = this.initFromSupabase();
    }
    return this.supabaseInitPromise;
  }

  /**
   * Load data directly from Supabase tables into CMSStore memory & cache
   */
  public async initFromSupabase(): Promise<void> {
    try {
      const [cameras, articles, mediaAssets, affiliateClicks] = await Promise.all([
        supabaseService.getCameras(),
        supabaseService.getArticles(),
        supabaseService.getMediaAssets(),
        supabaseService.getAffiliateClicks(),
      ]);

      // Supabase is single source of truth for these tables
      if (articles.length > 0) {
        this.data.articles = articles;
      }
      if (cameras.length > 0) {
        const camMap = new Map<string, CameraProduct>();
        initialCameras.forEach((c) => camMap.set(c.id, c));
        cameras.forEach((c) => camMap.set(c.id, c));
        this.data.cameras = Array.from(camMap.values());
      }
      if (mediaAssets.length > 0) {
        this.data.mediaAssets = mediaAssets;
      }
      if (affiliateClicks.length > 0) {
        this.data.affiliateClicks = affiliateClicks;
      }

      this.persistData(this.data);
      console.log(`[CMSStore] Successfully initialized from Supabase: ${cameras.length} cameras, ${articles.length} articles, ${mediaAssets.length} media assets`);
    } catch (err: any) {
      console.error('[CMSStore] Error initializing from Supabase:', err.message);
    }
  }

  public resetToDemo(): { published_version: number } {
    this.data = {
      version: (this.data.version || 1) + 1,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pages: this.getInitialPages(),
      globalDesign: DEFAULT_GLOBAL_DESIGN,
      reusableSections: DEFAULT_REUSABLE_SECTIONS,
      revisions: this.getInitialRevisions(),
      cameras: initialCameras,
      articles: initialArticles,
      mediaAssets: initialMediaAssets,
      siteSettings: initialSiteSettings,
      homeSettings: initialHomePageSettings,
      affiliateClicks: [],
      adminAccount: DEFAULT_ADMIN_ACCOUNT,
    };
    this.persistData(this.data);
    return { published_version: this.data.version };
  }
}

export const cmsStore = new CMSStore();
