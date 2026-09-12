-- =============================================================================
-- FUJIFINDER POSTGRESQL / SUPABASE DATABASE SCHEMA
-- Generated for FujiFinder CMS, Site Builder, Editorial & Affiliate System
-- Compatible with Supabase SQL Editor & standard PostgreSQL 14+
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. HELPER FUNCTION: AUTOMATIC UPDATED_AT TIMESTAMP
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. CAMERAS TABLE (Product Catalog, Lab Scores, Specs, Affiliate Offers)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cameras (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Fujifilm',
  category TEXT NOT NULL DEFAULT 'Compact & Street',
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  badge TEXT,
  rating NUMERIC(3, 1) NOT NULL DEFAULT 9.0,
  summary TEXT,
  pros JSONB NOT NULL DEFAULT '[]'::jsonb,
  cons JSONB NOT NULL DEFAULT '[]'::jsonb,
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  lab_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  affiliate_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cameras_slug ON public.cameras(slug);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON public.cameras(status);
CREATE INDEX IF NOT EXISTS idx_cameras_category ON public.cameras(category);
CREATE INDEX IF NOT EXISTS idx_cameras_brand ON public.cameras(brand);

DROP TRIGGER IF EXISTS trg_cameras_updated_at ON public.cameras;
CREATE TRIGGER trg_cameras_updated_at
  BEFORE UPDATE ON public.cameras
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. ARTICLES TABLE (Editorial Guides, Camera Reviews, SEO & Blocks)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Reviews',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  author TEXT NOT NULL DEFAULT 'FujiFinder Editorial',
  subtitle TEXT,
  excerpt TEXT,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  cover_image TEXT,
  read_time_minutes INTEGER NOT NULL DEFAULT 5,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  seo JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_camera_id TEXT REFERENCES public.cameras(id) ON DELETE SET NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_category ON public.articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON public.articles(featured);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON public.articles(published_at DESC);

DROP TRIGGER IF EXISTS trg_articles_updated_at ON public.articles;
CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. SUBSCRIBERS TABLE (Newsletter, Double Opt-In & Email Verification)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unconfirmed', 'unsubscribed', 'bounced')),
  source TEXT NOT NULL DEFAULT 'landing_page',
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  unsubscribe_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON public.subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON public.subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON public.subscribers(unsubscribe_token);

DROP TRIGGER IF EXISTS trg_subscribers_updated_at ON public.subscribers;
CREATE TRIGGER trg_subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 5. MEDIA ASSETS TABLE (Media Library, Uploads, Dimensions, File Sizes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.media_assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image/jpeg',
  dimensions TEXT NOT NULL DEFAULT '1200x800',
  category TEXT NOT NULL DEFAULT 'camera',
  size_bytes BIGINT NOT NULL DEFAULT 1048576,
  alt_text TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_category ON public.media_assets(category);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);

-- =============================================================================
-- 6. AFFILIATE CLICKS TABLE (Conversion Tracking, Outbound Retailer Traffic)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id TEXT REFERENCES public.cameras(id) ON DELETE SET NULL,
  camera_name TEXT,
  retailer TEXT NOT NULL DEFAULT 'Partner Store',
  target_url TEXT NOT NULL DEFAULT 'https://www.fujifinder.my.id',
  referrer TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_camera_id ON public.affiliate_clicks(camera_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created_at ON public.affiliate_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_retailer ON public.affiliate_clicks(retailer);

-- =============================================================================
-- 7. EMAIL CAMPAIGNS TABLE (Broadcast Newsletters, Analytics & Metrics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'archived')),
  html_content TEXT NOT NULL DEFAULT '<p></p>',
  recipient_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON public.email_campaigns(created_at DESC);

DROP TRIGGER IF EXISTS trg_email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER trg_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 8. EMAIL LOGS TABLE (Transactional & Broadcast Delivery Logs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'transactional' CHECK (type IN ('transactional', 'newsletter', 'verification', 'alert')),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'delivered', 'bounced')),
  error_message TEXT,
  provider TEXT NOT NULL DEFAULT 'smtp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON public.email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);

-- =============================================================================
-- 9. SITE SETTINGS TABLE (Branding, SEO Prefix, Currency, Tracking Scripts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  site_title TEXT NOT NULL DEFAULT 'FujiFinder',
  tagline TEXT DEFAULT 'Curated Camera Discovery & Lab-Grade Editorial',
  currency_code TEXT NOT NULL DEFAULT 'IDR',
  currency_symbol TEXT NOT NULL DEFAULT 'Rp',
  exchange_rate_usd NUMERIC(12, 4) NOT NULL DEFAULT 16250.0000,
  blog_slug_prefix TEXT NOT NULL DEFAULT '/article/',
  custom_head_scripts TEXT,
  custom_footer_scripts TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 10. HOME SETTINGS TABLE (Hero Slides, Curated Cards, Methodology Pillars)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.home_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  hero_slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  pillars JSONB NOT NULL DEFAULT '[]'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_home_settings_updated_at ON public.home_settings;
CREATE TRIGGER trg_home_settings_updated_at
  BEFORE UPDATE ON public.home_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 11. BUILDER PAGES TABLE (Visual Drag-and-Drop Page Builder Layouts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.builder_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'custom' CHECK (page_type IN ('system', 'custom', 'landing')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  seo JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_css TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_pages_slug ON public.builder_pages(slug);
CREATE INDEX IF NOT EXISTS idx_builder_pages_status ON public.builder_pages(status);

DROP TRIGGER IF EXISTS trg_builder_pages_updated_at ON public.builder_pages;
CREATE TRIGGER trg_builder_pages_updated_at
  BEFORE UPDATE ON public.builder_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 12. REUSABLE SECTIONS TABLE (Saved Builder Components & Layout Presets)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reusable_sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  section JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reusable_sections_category ON public.reusable_sections(category);

DROP TRIGGER IF EXISTS trg_reusable_sections_updated_at ON public.reusable_sections;
CREATE TRIGGER trg_reusable_sections_updated_at
  BEFORE UPDATE ON public.reusable_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 13. BUILDER REVISIONS TABLE (Page Builder Undo / History / Rollback)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.builder_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES public.builder_pages(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'Admin',
  note TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_revisions_page_id ON public.builder_revisions(page_id);
CREATE INDEX IF NOT EXISTS idx_builder_revisions_created_at ON public.builder_revisions(created_at DESC);

-- =============================================================================
-- 14. ADMIN USERS TABLE (CMS Super Admins & Editorial Staff)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Super Admin',
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
-- Enable RLS on all public tables
ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reusable_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 15.1 Cameras: Public can read published items; Full access for service_role / authenticated
CREATE POLICY "Public can view published cameras" ON public.cameras
  FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');

CREATE POLICY "Service role / admin manage cameras" ON public.cameras
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.2 Articles: Public can read published items; Full access for service_role / authenticated
CREATE POLICY "Public can view published articles" ON public.articles
  FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');

CREATE POLICY "Service role / admin manage articles" ON public.articles
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.3 Subscribers: Anyone can insert (newsletter subscribe); Admins manage
CREATE POLICY "Public can subscribe to newsletter" ON public.subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role / admin manage subscribers" ON public.subscribers
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.4 Media Assets: Public can view assets; Admins manage
CREATE POLICY "Public can view media assets" ON public.media_assets
  FOR SELECT USING (true);

CREATE POLICY "Service role / admin manage media assets" ON public.media_assets
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.5 Affiliate Clicks: Public can record clicks; Admins view analytics
CREATE POLICY "Public can log affiliate clicks" ON public.affiliate_clicks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role / admin view affiliate clicks" ON public.affiliate_clicks
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.6 Email Campaigns & Logs: Admin / Service Role only
CREATE POLICY "Service role / admin manage email campaigns" ON public.email_campaigns
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Service role / admin manage email logs" ON public.email_logs
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.7 Site & Home Settings: Public can read; Admins update
CREATE POLICY "Public can read site settings" ON public.site_settings
  FOR SELECT USING (true);

CREATE POLICY "Service role / admin manage site settings" ON public.site_settings
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Public can read home settings" ON public.home_settings
  FOR SELECT USING (true);

CREATE POLICY "Service role / admin manage home settings" ON public.home_settings
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.8 Builder Pages & Sections: Public can read published; Admins manage
CREATE POLICY "Public can view published builder pages" ON public.builder_pages
  FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');

CREATE POLICY "Service role / admin manage builder pages" ON public.builder_pages
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Public can view reusable sections" ON public.reusable_sections
  FOR SELECT USING (true);

CREATE POLICY "Service role / admin manage reusable sections" ON public.reusable_sections
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Service role / admin manage builder revisions" ON public.builder_revisions
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 15.9 Admin Users: Service Role only
CREATE POLICY "Service role manage admin users" ON public.admin_users
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
