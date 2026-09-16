import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { CameraProduct, Article, MediaAsset, AffiliateClickLog } from '../../src/types';
import { Subscriber, EmailCampaign, EmailLog } from '../../src/types/newsletterTypes';

// Default Supabase project credentials provided by user
const DEFAULT_SUPABASE_URL = 'https://zxzitnulvhbnkjvfsmig.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_j9gqv0_d5oWjRDPUkFjeCQ_FoKmV7JN';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVER_KEY || supabaseAnonKey;

export interface SupabaseSyncStats {
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
  error?: string;
}

class SupabaseService {
  private client: SupabaseClient;
  private isConnected = false;
  private lastSyncAt: string | null = null;
  private syncStats: SupabaseSyncStats['counts'] = {
    cameras: 0,
    articles: 0,
    subscribers: 0,
    media_assets: 0,
    affiliate_clicks: 0,
    email_campaigns: 0,
    email_logs: 0,
  };

  constructor() {
  this.client = createClient(supabaseUrl, supabaseServerKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  public getClient(): SupabaseClient {
    return this.client;
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string; counts: SupabaseSyncStats['counts'] }> {
    try {
      const [cams, arts, subs, media, clicks, campaigns, logs] = await Promise.all([
        this.client.from('cameras').select('id', { count: 'exact' }),
        this.client.from('articles').select('id', { count: 'exact' }),
        this.client.from('subscribers').select('id', { count: 'exact' }),
        this.client.from('media_assets').select('id', { count: 'exact' }),
        this.client.from('affiliate_clicks').select('id', { count: 'exact' }),
        this.client.from('email_campaigns').select('id', { count: 'exact' }),
        this.client.from('email_logs').select('id', { count: 'exact' }),
      ]);

      const counts = {
        cameras: cams.count ?? cams.data?.length ?? 0,
        articles: arts.count ?? arts.data?.length ?? 0,
        subscribers: subs.count ?? subs.data?.length ?? 0,
        media_assets: media.count ?? media.data?.length ?? 0,
        affiliate_clicks: clicks.count ?? clicks.data?.length ?? 0,
        email_campaigns: campaigns.count ?? campaigns.data?.length ?? 0,
        email_logs: logs.count ?? logs.data?.length ?? 0,
      };

      this.isConnected = true;
      this.syncStats = counts;
      return { ok: true, message: 'Connected to Supabase PostgreSQL database', counts };
    } catch (err: any) {
      this.isConnected = false;
      return {
        ok: false,
        message: err.message || 'Failed to connect to Supabase',
        counts: this.syncStats,
      };
    }
  }

  public getStatus(): SupabaseSyncStats {
    return {
      connected: this.isConnected,
      projectId: 'zxzitnulvhbnkjvfsmig',
      projectUrl: supabaseUrl,
      lastSyncAt: this.lastSyncAt,
      counts: this.syncStats,
    };
  }

  // -------------------------------------------------------------
  // CAMERAS TABLE
  // -------------------------------------------------------------
  public async getCameras(): Promise<CameraProduct[]> {
    try {
      const { data, error } = await this.client.from('cameras').select('*');
      if (error) {
        console.error('[Supabase] Error fetching cameras:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any): CameraProduct => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        return {
          id: row.id,
          name: row.name || rawData.name || 'Unnamed Camera',
          slug: row.slug || rawData.slug || row.id,
          brand: (row.brand || rawData.brand || 'Fujifilm') as any,
          category: (row.category || rawData.category || 'Compact & Street') as any,
          price: typeof row.price === 'number' ? row.price : (rawData.price || 0),
          priceRange: rawData.priceRange,
          rating: typeof row.rating === 'number' ? row.rating : (rawData.rating || 9.0),
          scoreBreakdown: row.scores && Object.keys(row.scores).length > 0 ? row.scores : (rawData.scoreBreakdown || {
            imageQuality: 9.0,
            autofocus: 8.8,
            buildErgonomics: 9.2,
            videoFeatures: 8.5,
            valueForMoney: 8.9,
          }),
          image: row.image_url || rawData.image || 'https://images.unsplash.com/photo-1510127031490-569779437d68?auto=format&fit=crop&w=1200&q=80',
          secondaryImages: Array.isArray(row.gallery) && row.gallery.length > 0 ? row.gallery : (rawData.secondaryImages || []),
          idealUseCase: rawData.idealUseCase || row.summary || 'Everyday and Travel Photography',
          shortDescription: row.summary || rawData.shortDescription || '',
          editorialOverview: rawData.editorialOverview || row.summary || '',
          whoIsThisFor: rawData.whoIsThisFor || 'Enthusiasts and mindful creators',
          pros: Array.isArray(row.pros) ? row.pros : (rawData.pros || []),
          cons: Array.isArray(row.cons) ? row.cons : (rawData.cons || []),
          specs: row.specs && Object.keys(row.specs).length > 0 ? { ...rawData.specs, ...row.specs } : (rawData.specs || {}),
          affiliateLinks: Array.isArray(row.affiliate_links) && row.affiliate_links.length > 0 ? row.affiliate_links : (rawData.affiliateLinks || []),
          featured: rawData.featured,
          editorsChoice: rawData.editorsChoice,
          bestForBadge: row.badge || rawData.bestForBadge,
          releaseYear: rawData.releaseYear || new Date(row.created_at || Date.now()).getFullYear(),
          relatedArticleSlugs: rawData.relatedArticleSlugs || [],
          relatedProductIds: rawData.relatedProductIds || [],
          status: (row.status || rawData.status || 'published') as any,
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching cameras:', err.message);
      return [];
    }
  }

  public async saveCamera(cam: CameraProduct): Promise<boolean> {
    try {
      const payload = {
        id: cam.id,
        slug: cam.slug,
        name: cam.name,
        brand: cam.brand,
        category: cam.category,
        price: cam.price,
        status: cam.status || 'published',
        badge: cam.bestForBadge || null,
        rating: cam.rating || 0,
        summary: cam.shortDescription || cam.idealUseCase || null,
        pros: cam.pros || [],
        cons: cam.cons || [],
        specs: cam.specs || {},
        scores: cam.scoreBreakdown || {},
        lab_metrics: {},
        image_url: cam.image || null,
        gallery: cam.secondaryImages || [],
        affiliate_links: cam.affiliateLinks || [],
        data: cam,
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.client.from('cameras').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error('[Supabase] Failed to upsert camera:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception upserting camera:', err.message);
      return false;
    }
  }

  public async deleteCamera(id: string): Promise<boolean> {
    try {
      const { error } = await this.client.from('cameras').delete().eq('id', id);
      if (error) {
        console.error('[Supabase] Failed to delete camera:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception deleting camera:', err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // ARTICLES TABLE
  // -------------------------------------------------------------
  public async getArticles(): Promise<Article[]> {
    try {
      const { data, error } = await this.client.from('articles').select('*');
      if (error) {
        console.error('[Supabase] Error fetching articles:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return [];
      }
      if (!data) return [];

      return data.map((row: any): Article => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        const authorObj = typeof row.author === 'object' && row.author !== null
          ? row.author
          : (rawData.author && typeof rawData.author === 'object'
              ? rawData.author
              : {
                  name: typeof row.author === 'string' && row.author.trim() ? row.author : 'FujiFinder Editorial',
                  role: rawData.author?.role || 'Staff Writer & Gear Analyst',
                  avatar: rawData.author?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
                  bio: rawData.author?.bio || 'Camera reviewer and documentary photographer.',
                });

        return {
          ...rawData,
          id: row.id,
          slug: row.slug || rawData.slug || row.id,
          title: row.title || rawData.title || 'Untitled Review',
          subtitle: row.subtitle || rawData.subtitle || '',
          excerpt: row.excerpt || rawData.excerpt || '',
          category: (row.category || rawData.category || 'Mirrorless') as any,
          author: authorObj,
          publishedAt: row.published_at
            ? String(row.published_at).split('T')[0]
            : (rawData.publishedAt || new Date().toISOString().split('T')[0]),
          updatedAt: row.updated_at
            ? String(row.updated_at).split('T')[0]
            : (rawData.updatedAt || new Date().toISOString().split('T')[0]),
          readTimeMinutes: typeof row.read_time_minutes === 'number'
            ? row.read_time_minutes
            : (typeof rawData.readTimeMinutes === 'number' ? rawData.readTimeMinutes : 5),
          coverImage: row.cover_image || rawData.coverImage || 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
          featured: Boolean(row.featured ?? rawData.featured),
          blocks: Array.isArray(row.blocks) && row.blocks.length > 0
            ? row.blocks
            : (Array.isArray(rawData.blocks) ? rawData.blocks : []),
          featuredCameraIds: Array.isArray(rawData.featuredCameraIds) && rawData.featuredCameraIds.length > 0
            ? rawData.featuredCameraIds
            : (row.related_camera_id ? [row.related_camera_id] : []),
          relatedArticleSlugs: Array.isArray(rawData.relatedArticleSlugs) ? rawData.relatedArticleSlugs : [],
          seo: row.seo && Object.keys(row.seo).length > 0
            ? row.seo
            : (rawData.seo || {
                metaTitle: row.title,
                metaDescription: row.excerpt || '',
                focusKeyword: 'fujifilm camera review',
                primaryKeyword: 'fujifilm camera review',
                secondaryKeywords: [],
              }),
          status: (row.status || rawData.status || 'published') as any,
          views: typeof row.view_count === 'number' ? row.view_count : (rawData.views || 0),
          affiliateClicks: typeof rawData.affiliateClicks === 'number' ? rawData.affiliateClicks : 0,

          // Core Placement Flags - critical for Public Landing Page and Admin badges
          showOnLandingPage: rawData.showOnLandingPage !== undefined ? Boolean(rawData.showOnLandingPage) : true,
          isHeroFeatured: Boolean(rawData.isHeroFeatured),
          isFeaturedStory: Boolean(rawData.isFeaturedStory),
          isTrending: Boolean(rawData.isTrending),
          isPopularNow: Boolean(rawData.isPopularNow),
          isFeaturedContent: Boolean(rawData.isFeaturedContent),
          isLatest: rawData.isLatest !== undefined ? Boolean(rawData.isLatest) : true,
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching articles:', err.message);
      return [];
    }
  }

  public async saveArticle(art: Article): Promise<{ success: boolean; error?: string }> {
    try {
      const authorStr = typeof art.author === 'string'
        ? art.author
        : (art.author?.name || 'FujiFinder Editorial');

      const payload = {
        id: art.id,
        slug: art.slug,
        title: art.title,
        category: art.category || 'Mirrorless',
        status: art.status || 'published',
        author: authorStr,
        subtitle: art.subtitle || null,
        excerpt: art.excerpt || null,
        featured: Boolean(art.featured || art.isHeroFeatured || art.isFeaturedStory),
        cover_image: art.coverImage || null,
        read_time_minutes: art.readTimeMinutes || 5,
        blocks: Array.isArray(art.blocks) ? art.blocks : [],
        seo: art.seo || {},
        related_camera_id: art.featuredCameraIds?.[0] || null,
        tags: art.seo?.secondaryKeywords || [],
        view_count: art.views || 0,
        published_at: art.publishedAt ? new Date(art.publishedAt).toISOString() : new Date().toISOString(),
        data: art,
        updated_at: new Date().toISOString(),
      };

      console.log(`[Supabase] Upserting article "${art.title}" (id: ${art.id}, slug: ${art.slug})...`);
      const { error } = await this.client.from('articles').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error('[Supabase] Failed to upsert article:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return {
          success: false,
          error: `${error.message}${error.details ? ` (${error.details})` : ''}`,
        };
      }
      console.log(`[Supabase] Article "${art.title}" (id: ${art.id}) saved to Supabase successfully.`);
      return { success: true };
    } catch (err: any) {
      console.error('[Supabase] Exception upserting article:', err.message);
      return { success: false, error: err.message || 'Unknown exception saving article to Supabase' };
    }
  }

  public async deleteArticle(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[Supabase] Deleting article id: ${id}...`);
      const { error } = await this.client.from('articles').delete().eq('id', id);
      if (error) {
        console.error('[Supabase] Failed to delete article:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return { success: false, error: error.message };
      }
      console.log(`[Supabase] Article id ${id} deleted from Supabase successfully.`);
      return { success: true };
    } catch (err: any) {
      console.error('[Supabase] Exception deleting article:', err.message);
      return { success: false, error: err.message || 'Unknown exception deleting article from Supabase' };
    }
  }

  // -------------------------------------------------------------
  // SUBSCRIBERS TABLE
  // -------------------------------------------------------------
  public async getSubscribers(): Promise<Subscriber[]> {
    try {
      const { data, error } = await this.client.from('subscribers').select('*');
      if (error) {
        console.error('[Supabase] Error fetching subscribers:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any): Subscriber => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        return {
          id: row.id,
          email: row.email,
          name: row.name || rawData.name,
          status: row.status || rawData.status || 'active',
          subscribed_at: rawData.subscribed_at || row.created_at,
          email_verified_at: row.verified_at || rawData.email_verified_at,
          verification_token_hash: row.verification_token || rawData.verification_token_hash || null,
          verification_expires_at: rawData.verification_expires_at || null,
          unsubscribed_at: rawData.unsubscribed_at || null,
          created_at: row.created_at || rawData.created_at,
          updated_at: row.updated_at || rawData.updated_at,
          welcome_email_sent_at: rawData.welcome_email_sent_at || null,
          double_opt_in_token: rawData.double_opt_in_token || null,
          unsubscribe_token: row.unsubscribe_token || rawData.unsubscribe_token || ('unsub_' + row.id),
          source: row.source || rawData.source || 'landing_page',
          verification_attempts: rawData.verification_attempts || 0,
          last_verification_sent_at: rawData.last_verification_sent_at || null,
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching subscribers:', err.message);
      return [];
    }
  }

  public async saveSubscriber(sub: Subscriber): Promise<boolean> {
    try {
      const payload = {
        id: sub.id,
        email: sub.email.toLowerCase().trim(),
        name: sub.name || null,
        status: sub.status,
        source: sub.source || 'landing_page',
        verification_token: sub.verification_token_hash || null,
        verified_at: sub.email_verified_at || null,
        unsubscribe_token: sub.unsubscribe_token || null,
        metadata: {
          double_opt_in_token: sub.double_opt_in_token,
          verification_attempts: sub.verification_attempts,
        },
        data: sub,
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.client.from('subscribers').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error('[Supabase] Failed to upsert subscriber:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception upserting subscriber:', err.message);
      return false;
    }
  }

  public async deleteSubscriber(idOrEmail: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('subscribers')
        .delete()
        .or(`id.eq.${idOrEmail},email.eq.${idOrEmail.toLowerCase().trim()}`);
      if (error) {
        console.error('[Supabase] Failed to delete subscriber:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception deleting subscriber:', err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // MEDIA ASSETS TABLE
  // -------------------------------------------------------------
  public async getMediaAssets(): Promise<MediaAsset[]> {
    try {
      const { data, error } = await this.client.from('media_assets').select('*');
      if (error) {
        console.error('[Supabase] Error fetching media assets:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any): MediaAsset => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        return {
          id: row.id,
          title: row.title || rawData.title || 'asset.jpg',
          url: row.url,
          category: (row.category || rawData.category || 'camera') as any,
          dimensions: row.dimensions || rawData.dimensions || '1200x800',
          fileSize: rawData.fileSize || (typeof row.size_bytes === 'number' ? `${Math.round(row.size_bytes / 1024)} KB` : '1.2 MB'),
          uploadedAt: row.created_at || rawData.uploadedAt || new Date().toISOString(),
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching media assets:', err.message);
      return [];
    }
  }

  public async saveMediaAsset(asset: MediaAsset): Promise<boolean> {
    try {
      const payload = {
        id: asset.id,
        title: asset.title || 'Asset',
        url: asset.url,
        type: 'image/jpeg',
        dimensions: asset.dimensions || '1200x800',
        data: asset,
        category: asset.category || 'camera',
        size_bytes: 1024 * 1024,
        alt_text: asset.title || null,
        created_at: asset.uploadedAt || new Date().toISOString(),
      };

      const { error } = await this.client.from('media_assets').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error('[Supabase] Failed to upsert media asset:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception upserting media asset:', err.message);
      return false;
    }
  }

  public async deleteMediaAsset(id: string): Promise<boolean> {
    try {
      const { error } = await this.client.from('media_assets').delete().eq('id', id);
      if (error) {
        console.error('[Supabase] Failed to delete media asset:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception deleting media asset:', err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // AFFILIATE CLICKS TABLE
  // -------------------------------------------------------------
  public async getAffiliateClicks(limit = 500): Promise<AffiliateClickLog[]> {
    try {
      const { data, error } = await this.client
        .from('affiliate_clicks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[Supabase] Error fetching affiliate clicks:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any): AffiliateClickLog => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        return {
          id: row.id,
          productId: row.camera_id || rawData.productId || 'cam_1',
          productName: row.camera_name || rawData.productName || 'Fujifilm Camera',
          retailer: row.retailer || 'Unknown Retailer',
          sourceType: (rawData.sourceType || 'product_page') as any,
          sourceSlug: rawData.sourceSlug || undefined,
          timestamp: row.created_at || rawData.timestamp || new Date().toISOString(),
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching affiliate clicks:', err.message);
      return [];
    }
  }

  public async recordAffiliateClick(click: AffiliateClickLog): Promise<boolean> {
    try {
      // id MUST be a valid UUID for this table
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(click.id)
        ? click.id
        : crypto.randomUUID();

      const payload = {
        id: uuid,
        camera_id: click.productId || null,
        camera_name: click.productName || null,
        retailer: click.retailer || 'Partner Store',
        target_url: 'https://www.fujifinder.my.id', // NOT NULL column
        referrer: null,
        ip_hash: null,
        user_agent: null,
        created_at: click.timestamp || new Date().toISOString(),
      };

      const { error } = await this.client.from('affiliate_clicks').insert(payload);
      if (error) {
        console.error('[Supabase] Failed to insert affiliate click:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception inserting affiliate click:', err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // EMAIL CAMPAIGNS TABLE
  // -------------------------------------------------------------
  public async getEmailCampaigns(): Promise<EmailCampaign[]> {
    try {
      const { data, error } = await this.client.from('email_campaigns').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('[Supabase] Error fetching email campaigns:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any): EmailCampaign => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        return {
          id: row.id,
          name: row.name || 'Untitled Campaign',
          subject: row.subject || '',
          previewText: row.preview_text || '',
          fromName: rawData.fromName || 'FujiFinder Editorial',
          replyTo: rawData.replyTo || 'editorial@fujifinder.my.id',
          content: row.html_content || rawData.content || '',
          audience: (rawData.audience || 'all_active') as any,
          provider: (rawData.provider || 'resend') as any,
          recipientCount: row.sent_count || rawData.recipientCount || 0,
          status: (row.status || 'draft') as any,
          created_at: row.created_at,
          sent_at: row.sent_at || null,
          metrics: rawData.metrics || {
            sent: row.sent_count || 0,
            delivered: row.sent_count || 0,
            failed: 0,
            opened: row.open_count || 0,
            clicked: row.click_count || 0,
          },
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching email campaigns:', err.message);
      return [];
    }
  }

  public async saveEmailCampaign(cmp: EmailCampaign): Promise<boolean> {
    try {
      const payload = {
        id: cmp.id,
        name: cmp.name || 'Untitled Campaign',
        subject: cmp.subject || 'No Subject',
        preview_text: cmp.previewText || null,
        status: cmp.status || 'draft',
        html_content: cmp.content || '<p></p>', // NOT NULL column
        recipient_filter: {},
        sent_count: cmp.metrics?.sent || cmp.recipientCount || 0,
        open_count: cmp.metrics?.opened || 0,
        click_count: cmp.metrics?.clicked || 0,
        scheduled_for: null,
        sent_at: cmp.sent_at || null,
        created_at: cmp.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.client.from('email_campaigns').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error('[Supabase] Failed to upsert email campaign:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception upserting email campaign:', err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // EMAIL LOGS TABLE
  // -------------------------------------------------------------
  public async getEmailLogs(limit = 200): Promise<EmailLog[]> {
    try {
      const { data, error } = await this.client
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[Supabase] Error fetching email logs:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any): EmailLog => {
        const rawData = row.data && typeof row.data === 'object' ? row.data : {};
        return {
          id: row.id,
          campaignId: row.campaign_id || undefined,
          recipient: row.recipient_email || rawData.recipient || '',
          subject: row.subject || '',
          emailType: (row.type || rawData.emailType || 'transactional') as any,
          provider: (row.provider || 'smtp') as any,
          status: (row.status || 'sent') as any,
          errorMessage: row.error_message || undefined,
          sent_at: row.created_at,
        };
      });
    } catch (err: any) {
      console.error('[Supabase] Exception fetching email logs:', err.message);
      return [];
    }
  }

  public async recordEmailLog(log: Omit<EmailLog, 'id' | 'sent_at'> & { id?: string; sent_at?: string }): Promise<boolean> {
    try {
      const payload = {
        id: log.id || `log_${crypto.randomBytes(8).toString('hex')}`,
        campaign_id: log.campaignId || null,
        recipient_email: log.recipient,
        subject: log.subject,
        type: log.emailType || 'transactional',
        status: log.status || 'sent',
        error_message: log.errorMessage || null,
        provider: log.provider || 'smtp',
        created_at: log.sent_at || new Date().toISOString(),
      };

      const { error } = await this.client.from('email_logs').insert(payload);
      if (error) {
        console.error('[Supabase] Failed to insert email log:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[Supabase] Exception inserting email log:', err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // FULL INITIAL DATA SYNC
  // -------------------------------------------------------------
  public async syncAllDataFromSupabase(): Promise<{
    success: boolean;
    cameras: CameraProduct[];
    articles: Article[];
    subscribers: Subscriber[];
    mediaAssets: MediaAsset[];
    affiliateClicks: AffiliateClickLog[];
    campaigns: EmailCampaign[];
    logs: EmailLog[];
  }> {
    console.log('[Supabase] Starting full data synchronization from Supabase...');
    const [cameras, articles, subscribers, mediaAssets, affiliateClicks, campaigns, logs] = await Promise.all([
      this.getCameras(),
      this.getArticles(),
      this.getSubscribers(),
      this.getMediaAssets(),
      this.getAffiliateClicks(),
      this.getEmailCampaigns(),
      this.getEmailLogs(),
    ]);

    this.lastSyncAt = new Date().toISOString();
    this.isConnected = true;
    this.syncStats = {
      cameras: cameras.length,
      articles: articles.length,
      subscribers: subscribers.length,
      media_assets: mediaAssets.length,
      affiliate_clicks: affiliateClicks.length,
      email_campaigns: campaigns.length,
      email_logs: logs.length,
    };

    console.log('[Supabase] Synchronized from Supabase tables successfully:', this.syncStats);

    return {
      success: true,
      cameras,
      articles,
      subscribers,
      mediaAssets,
      affiliateClicks,
      campaigns,
      logs,
    };
  }
}

export const supabaseService = new SupabaseService();
