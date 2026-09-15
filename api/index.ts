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

  // If Vercel rewrote the URL and stripped '/api' (e.g. req.url is '/cameras' instead of '/api/cameras'),
  // normalize it so Express routes match seamlessly
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return (app as any)(req, res);
}
