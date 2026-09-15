import type { Request, Response } from 'express';
import app from '../server';
import { cmsStore } from '../server/data/cmsStore';
import { newsletterStore } from '../server/data/newsletterStore';

let isInitialized = false;

async function ensureStoresInitialized() {
  if (!isInitialized) {
    try {
      await Promise.all([
        cmsStore.initFromSupabase(),
        newsletterStore.initFromSupabase(),
      ]);
      isInitialized = true;
    } catch (err: any) {
      console.warn('[Vercel Serverless] Supabase store initialization notice:', err?.message || err);
      isInitialized = true;
    }
  }
}

export default async function handler(req: Request, res: Response) {
  // Ensure Supabase stores are loaded
  await ensureStoresInitialized();

  // Robust path normalization across all Vercel execution contexts
  let targetPath = '';

  if (req.query && req.query.path) {
    const segments = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path);
    targetPath = `/api/${segments}`;
  } else if (req.headers['x-matched-path']) {
    targetPath = req.headers['x-matched-path'] as string;
  } else if (req.headers['x-forwarded-uri']) {
    targetPath = req.headers['x-forwarded-uri'] as string;
  } else if (req.url) {
    targetPath = req.url;
  }

  if (targetPath) {
    // Strip domain/origin if full URL was provided
    if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
      try {
        const u = new URL(targetPath);
        targetPath = u.pathname + u.search;
      } catch {}
    }

    // Ensure it starts with /api
    if (!targetPath.startsWith('/api')) {
      targetPath = '/api' + (targetPath.startsWith('/') ? targetPath : '/' + targetPath);
    }

    // Preserve query parameters
    const originalQueryIndex = (req.url || '').indexOf('?');
    if (originalQueryIndex >= 0 && !targetPath.includes('?')) {
      targetPath += req.url.slice(originalQueryIndex);
    }

    req.url = targetPath;
  }

  return (app as any)(req, res);
}
