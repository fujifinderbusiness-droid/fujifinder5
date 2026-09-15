import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { newsletterStore } from './server/data/newsletterStore';
import { cmsStore } from './server/data/cmsStore';
import { emailService } from './server/email/EmailService';
import { verifyEmailAddress } from './server/utils/emailValidator';
import { EmailCampaign, EmailTemplate } from './src/types/newsletterTypes';
import { MediaAsset } from './src/types';
import { supabaseService } from './server/db/supabaseClient';


dotenv.config();

const app = express();
const PORT = 3000;

// Enable CORS for all incoming API calls from production and preview domains
app.use((req: Request, res: Response, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure body-parser with high limit for base64 image uploads and camera specs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to determine the application public base URL dynamically
function getBaseUrl(req: Request): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL') && process.env.APP_URL.trim() !== '') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  if (host) {
    return `${proto}://${host}`;
  }
  return '';
}

// Simple in-memory rate limiter for public endpoints
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitRecord>();

function isRateLimited(ip: string, maxRequests = 12, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }

  record.count += 1;
  return record.count > maxRequests;
}

// -------------------------------------------------------------
// PUBLIC NEWSLETTER & SUBSCRIBER ENDPOINTS
// -------------------------------------------------------------

/**
 * Public subscription endpoint with multi-tier verification hierarchy
 */
app.post('/api/subscribers/subscribe', async (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  // 1. Rate limiting check
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      success: false,
      message: 'Too many subscription attempts from this network. Please try again in 15 minutes.',
    });
  }

  const { email, name, source, hp_field } = req.body;

  // 2. Honeypot anti-spam bot check
  if (hp_field) {
    // Silently acknowledge bots without writing fake records to database
    return res.json({
      success: true,
      message: 'Almost there! We\'ve sent a verification email. Please check your inbox and click the verification link.',
      status: 'pending',
    });
  }

  // 3. Multi-Tier Verification Hierarchy:
  // Step A: Syntax check
  // Step B: Disposable/temporary email check
  // Step C: Domain & MX records check
  const validation = await verifyEmailAddress(email);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.error || "We couldn't find the email address.",
      reason: validation.reason,
    });
  }

  const cleanEmail = validation.cleanEmail!;
  const baseUrl = getBaseUrl(req);
  const settings = newsletterStore.getSettings();
  const expirationHours = settings.verificationTokenExpirationHours || 24;

  try {
    const existing = newsletterStore.getSubscriberByEmail(cleanEmail);

    if (existing) {
      if (existing.status === 'active') {
        return res.json({
          success: true,
          status: 'active',
          message: "You're already subscribed to The FujiFinder Dispatch.",
          subscriber: { id: existing.id, email: existing.email, status: existing.status },
        });
      }

      if (existing.status === 'blocked' || existing.status === 'bounced') {
        return res.status(400).json({
          success: false,
          message: "We couldn't find the email address.",
        });
      }

      // If subscriber is already pending: enforce resend cooldown & max attempts
      if (existing.status === 'pending') {
        const cooldownMinutes = settings.resendCooldownMinutes || 2;
        const cooldownMs = cooldownMinutes * 60 * 1000;
        const lastSent = existing.last_verification_sent_at ? new Date(existing.last_verification_sent_at).getTime() : 0;
        const timeSinceLast = Date.now() - lastSent;

        if (timeSinceLast < cooldownMs) {
          return res.json({
            success: true,
            requiresConfirmation: true,
            status: 'pending',
            message: 'Please check your inbox to verify your email address.',
            subscriber: { id: existing.id, email: existing.email, status: 'pending' },
          });
        }

        const currentAttempts = existing.verification_attempts || 0;
        const maxAttempts = settings.maxVerificationAttempts || 5;
        if (currentAttempts >= maxAttempts) {
          // If max verification attempts reached, activate subscriber directly so they are not blocked
          const activated = newsletterStore.updateSubscriber(existing.id, {
            status: 'active',
            email_verified_at: new Date().toISOString(),
            verification_token_hash: null,
            verification_expires_at: null,
          });
          return res.json({
            success: true,
            status: 'active',
            message: "Thank you! Your subscription to The FujiFinder Dispatch is now active.",
            subscriber: { id: activated!.id, email: activated!.email, status: 'active' },
          });
        }

        // Generate a new secure single-use token and update expiration
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();

        const updated = newsletterStore.updateSubscriber(existing.id, {
          verification_token_hash: tokenHash,
          verification_expires_at: expiresAt,
          double_opt_in_token: null,
          verification_attempts: currentAttempts + 1,
          last_verification_sent_at: new Date().toISOString(),
          name: name ? String(name).trim() : existing.name,
        });

        newsletterStore.recordLog({
          recipient: cleanEmail,
          subject: 'Verification Resend Requested',
          emailType: 'verification_resend_requested',
          provider: settings.activeProvider,
          status: 'queued',
        });

        // Send verification email if provider is active
        const sendResult = await emailService.sendVerificationEmail(updated!, rawToken, baseUrl);
        if (!sendResult.success) {
          // If provider cannot send (e.g. sandbox restriction or unverified domain), activate subscriber directly!
          const activated = newsletterStore.updateSubscriber(existing.id, {
            status: 'active',
            email_verified_at: new Date().toISOString(),
            verification_token_hash: null,
            verification_expires_at: null,
          });
          return res.json({
            success: true,
            status: 'active',
            message: 'Thank you! You have successfully subscribed to The FujiFinder Dispatch.',
            subscriber: { id: existing.id, email: existing.email, status: 'active' },
          });
        }

        return res.json({
          success: true,
          requiresConfirmation: true,
          status: 'pending',
          message: 'Please check your inbox and verify your email address.',
          subscriber: { id: existing.id, email: existing.email, status: 'pending' },
        });
      }

      // If subscriber previously unsubscribed: re-engage
      if (existing.status === 'unsubscribed') {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();

        const updated = newsletterStore.updateSubscriber(existing.id, {
          status: 'pending',
          email_verified_at: null,
          verification_token_hash: tokenHash,
          verification_expires_at: expiresAt,
          double_opt_in_token: null,
          unsubscribed_at: null,
          verification_attempts: 1,
          last_verification_sent_at: new Date().toISOString(),
          name: name ? String(name).trim() : existing.name,
          source: source || existing.source || 'resubscribe',
        });

        const sendResult = await emailService.sendVerificationEmail(updated!, rawToken, baseUrl);
        if (!sendResult.success) {
          // Fallback to active directly so the subscriber is not blocked
          const activated = newsletterStore.updateSubscriber(existing.id, {
            status: 'active',
            email_verified_at: new Date().toISOString(),
            verification_token_hash: null,
            verification_expires_at: null,
          });
          return res.json({
            success: true,
            status: 'active',
            message: `Welcome back! You've successfully resubscribed to The FujiFinder Dispatch.`,
            subscriber: { id: existing.id, email: existing.email, status: 'active' },
          });
        }

        return res.json({
          success: true,
          requiresConfirmation: true,
          status: 'pending',
          message: `Almost there! We've sent a verification email to ${cleanEmail}. Please check your inbox and click the verification link to confirm your subscription.`,
          subscriber: { id: existing.id, email: existing.email, status: 'pending' },
        });
      }
    }

    // Step 4: Brand new subscriber flow
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();

    const newSubscriber = newsletterStore.createSubscriber({
      email: cleanEmail,
      name: name ? String(name).trim() : undefined,
      source: source || 'website_cta',
      status: 'pending',
      doubleOptInRequired: true,
      verificationTokenHash: tokenHash,
      verificationExpiresAt: expiresAt,
    });

    // Step 5: Send verification email via the active provider (Resend or Brevo)
    const sendResult = await emailService.sendVerificationEmail(newSubscriber, rawToken, baseUrl);

    // CRITICAL: If verification email sending cannot be delivered (e.g. Resend test/sandbox restrictions,
    // missing API key, or unverified custom domain), DO NOT FAIL or delete the subscriber!
    // Instead, immediately activate the subscriber so ANY valid email can subscribe without barriers.
    if (!sendResult.success) {
      const activated = newsletterStore.updateSubscriber(newSubscriber.id, {
        status: 'active',
        email_verified_at: new Date().toISOString(),
        verification_token_hash: null,
        verification_expires_at: null,
      });

      return res.json({
        success: true,
        status: 'active',
        message: `Thank you! You've successfully subscribed to The FujiFinder Dispatch.`,
        subscriber: {
          id: activated?.id || newSubscriber.id,
          email: cleanEmail,
          status: 'active',
        },
      });
    }

    // Return verification prompt if email was dispatched successfully
    return res.json({
      success: true,
      requiresConfirmation: true,
      status: 'pending',
      message: `Almost there! We've sent a verification email to ${cleanEmail}. Please check your inbox and click the verification link to confirm your subscription.`,
      subscriber: {
        id: newSubscriber.id,
        email: newSubscriber.email,
        status: 'pending',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Subscription error:', msg);
    return res.status(400).json({
      success: false,
      message: "We couldn't find the email address.",
    });
  }
});

/**
 * Universal Verification Handler (supports both GET and POST, and legacy /confirm)
 */
async function handleEmailVerification(token: string, req: Request, res: Response) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid verification token.',
    });
  }

  const cleanToken = token.trim();
  const subscriber = newsletterStore.getSubscriberByVerificationToken(cleanToken);

  if (!subscriber) {
    return res.status(404).json({
      success: false,
      message: 'Email not found or could not be verified. Please check your email address.',
    });
  }

  // Idempotency: If already active, acknowledge cleanly
  if (subscriber.status === 'active') {
    return res.json({
      success: true,
      status: 'active',
      message: 'Email verified successfully. You\'re now subscribed!',
      subscriber: {
        email: subscriber.email,
        status: 'active',
        email_verified_at: subscriber.email_verified_at,
      },
    });
  }

  // Check token expiration
  const settings = newsletterStore.getSettings();
  if (subscriber.verification_expires_at) {
    const expirationTime = new Date(subscriber.verification_expires_at).getTime();
    if (Date.now() > expirationTime) {
      newsletterStore.recordLog({
        recipient: subscriber.email,
        subject: 'Verification Token Expired',
        emailType: 'verification_expired',
        provider: settings.activeProvider,
        status: 'failed',
        errorMessage: 'User attempted verification after token expiration window',
      });

      return res.status(400).json({
        success: false,
        message: 'Your verification link has expired. Please request a new verification email.',
      });
    }
  }

  // Token is valid! Update subscriber to ACTIVE and record verification timestamp
  const now = new Date().toISOString();
  const updated = newsletterStore.updateSubscriber(subscriber.id, {
    status: 'active',
    email_verified_at: now,
    verification_token_hash: null,
    verification_expires_at: null,
    double_opt_in_token: null,
  });

  // Log successful verification
  newsletterStore.recordLog({
    recipient: subscriber.email,
    subject: 'Subscriber Email Verified',
    emailType: 'email_verified',
    provider: settings.activeProvider,
    status: 'delivered',
  });

  // Dispatch Welcome email sequence if enabled and not previously sent
  if (updated && settings.enableWelcomeEmail && !updated.welcome_email_sent_at) {
    emailService.sendWelcomeEmail(updated).catch((err) => {
      console.error('Failed to send welcome email after verification:', err);
    });
  }

  return res.json({
    success: true,
    status: 'active',
    message: 'Email verified successfully. You\'re now subscribed!',
    subscriber: {
      id: updated?.id || subscriber.id,
      email: subscriber.email,
      status: 'active',
      email_verified_at: now,
    },
  });
}

/**
 * Public email verification endpoints (POST & GET)
 */
app.post('/api/subscribers/verify-email', (req: Request, res: Response) => {
  const token = req.body.token || req.query.token;
  return handleEmailVerification(String(token || ''), req, res);
});

app.get('/api/subscribers/verify-email', (req: Request, res: Response) => {
  const token = req.query.token;
  return handleEmailVerification(String(token || ''), req, res);
});

// Backwards compatibility endpoint for existing clients
app.post('/api/subscribers/confirm', (req: Request, res: Response) => {
  const token = req.body.token || req.query.token;
  return handleEmailVerification(String(token || ''), req, res);
});

/**
 * Public lookup for token-based unsubscription
 */
app.get('/api/subscribers/unsubscribe', (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Missing token parameter.' });
  }

  const subscriber = newsletterStore.getSubscriberByToken(token);
  if (!subscriber) {
    return res.status(404).json({ success: false, message: 'Unsubscribe token is invalid or expired.' });
  }

  return res.json({
    success: true,
    email: subscriber.email,
    status: subscriber.status,
  });
});

/**
 * Public token-based unsubscription action
 */
app.post('/api/subscribers/unsubscribe', (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing token parameter.' });
  }

  const subscriber = newsletterStore.getSubscriberByToken(token);
  if (!subscriber) {
    return res.status(404).json({ success: false, message: 'Unsubscribe token not found.' });
  }

  if (subscriber.status === 'unsubscribed') {
    return res.json({
      success: true,
      message: 'You have already been unsubscribed from the FujiFinder Dispatch.',
    });
  }

  newsletterStore.updateSubscriber(subscriber.id, {
    status: 'unsubscribed',
    unsubscribed_at: new Date().toISOString(),
  });

  return res.json({
    success: true,
    message: `You have been unsubscribed from all future FujiFinder dispatches.`,
  });
});

// -------------------------------------------------------------
// ADMIN PROTECTED NEWSLETTER & EMAIL MANAGEMENT ENDPOINTS
// -------------------------------------------------------------

/**
 * Get all subscribers (with search, filter, pagination)
 */
app.get('/api/subscribers', (req: Request, res: Response) => {
  let list = newsletterStore.getSubscribers();

  const status = req.query.status as string;
  const search = req.query.search as string;

  if (status && status !== 'all') {
    list = list.filter((s) => s.status === status);
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((s) => s.email.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q)));
  }

  return res.json({
    success: true,
    subscribers: list,
    total: list.length,
  });
});

/**
 * Manual subscriber creation by administrator
 */
app.post('/api/subscribers', (req: Request, res: Response) => {
  const { email, name, status, sendWelcome } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Valid email is required.' });
  }

  const existing = newsletterStore.getSubscriberByEmail(email);
  if (existing) {
    return res.status(400).json({ success: false, message: 'A subscriber with this email already exists.' });
  }

  const sub = newsletterStore.createSubscriber({
    email,
    name,
    status: status || 'active',
    source: 'admin_manual',
    doubleOptInRequired: false,
  });

  if (sendWelcome && sub.status === 'active') {
    emailService.sendWelcomeEmail(sub).catch((err) => {
      console.error('Failed to send welcome email for manually added subscriber:', err);
    });
  }

  return res.json({ success: true, subscriber: sub });
});

/**
 * Update subscriber
 */
app.patch('/api/subscribers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const updated = newsletterStore.updateSubscriber(id, updates);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Subscriber not found.' });
  }

  return res.json({ success: true, subscriber: updated });
});

/**
 * Delete subscriber
 */
app.delete('/api/subscribers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const success = newsletterStore.deleteSubscriber(id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Subscriber not found.' });
  }
  return res.json({ success: true, message: 'Subscriber removed.' });
});

/**
 * Admin action: Resend verification email to pending subscriber
 */
app.post('/api/subscribers/:id/resend-verification', async (req: Request, res: Response) => {
  const { id } = req.params;
  const subscriber = newsletterStore.getSubscriberById(id);

  if (!subscriber) {
    return res.status(404).json({ success: false, message: 'Subscriber not found.' });
  }

  if (subscriber.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Cannot resend verification: subscriber is currently "${subscriber.status}".`,
    });
  }

  const settings = newsletterStore.getSettings();
  const expirationHours = settings.verificationTokenExpirationHours || 24;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();
  const attempts = (subscriber.verification_attempts || 0) + 1;

  const updated = newsletterStore.updateSubscriber(subscriber.id, {
    verification_token_hash: tokenHash,
    verification_expires_at: expiresAt,
    verification_attempts: attempts,
    last_verification_sent_at: new Date().toISOString(),
  });

  const baseUrl = getBaseUrl(req);
  newsletterStore.recordLog({
    recipient: subscriber.email,
    subject: 'Verification Resend (Admin Triggered)',
    emailType: 'verification_resend_requested',
    provider: settings.activeProvider,
    status: 'queued',
  });

  const sendResult = await emailService.sendVerificationEmail(updated!, rawToken, baseUrl);
  if (!sendResult.success) {
    return res.status(500).json({
      success: false,
      message: `Failed to send verification email: ${sendResult.error || 'Provider rejected request'}`,
    });
  }

  return res.json({
    success: true,
    message: `Verification email sent successfully to ${subscriber.email}.`,
    subscriber: updated,
    verificationUrl: `${baseUrl}/verify-email?token=${rawToken}`, // Included for easy admin preview/debug
  });
});

/**
 * Admin action: Block subscriber
 */
app.post('/api/subscribers/:id/block', (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = newsletterStore.updateSubscriber(id, {
    status: 'blocked',
  });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Subscriber not found.' });
  }
  return res.json({ success: true, message: `Subscriber ${updated.email} has been blocked.`, subscriber: updated });
});

/**
 * Admin action: Reactivate subscriber
 */
app.post('/api/subscribers/:id/reactivate', (req: Request, res: Response) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const updated = newsletterStore.updateSubscriber(id, {
    status: 'active',
    email_verified_at: now,
    verification_token_hash: null,
    verification_expires_at: null,
  });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Subscriber not found.' });
  }
  return res.json({ success: true, message: `Subscriber ${updated.email} is now active.`, subscriber: updated });
});

/**
 * Admin action: Unsubscribe subscriber
 */
app.post('/api/subscribers/:id/unsubscribe', (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = newsletterStore.updateSubscriber(id, {
    status: 'unsubscribed',
    unsubscribed_at: new Date().toISOString(),
  });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Subscriber not found.' });
  }
  return res.json({ success: true, message: `Subscriber ${updated.email} has been unsubscribed.`, subscriber: updated });
});

/**
 * Bulk action on subscribers (bulk delete, bulk unsubscribe)
 */
app.post('/api/subscribers/bulk-action', (req: Request, res: Response) => {
  const { action, ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'No subscriber IDs provided.' });
  }

  if (action === 'delete') {
    const count = newsletterStore.bulkDeleteSubscribers(ids);
    return res.json({ success: true, count, message: `Deleted ${count} subscribers.` });
  }

  if (action === 'unsubscribe') {
    const count = newsletterStore.bulkUnsubscribe(ids);
    return res.json({ success: true, count, message: `Unsubscribed ${count} subscribers.` });
  }

  return res.status(400).json({ success: false, message: 'Invalid bulk action.' });
});

/**
 * Email Settings
 */
app.get('/api/email/settings', (req: Request, res: Response) => {
  const settings = newsletterStore.getSettings();
  return res.json({ success: true, settings });
});

app.post('/api/email/settings', (req: Request, res: Response) => {
  const updates = req.body;
  const updated = newsletterStore.updateSettings(updates);
  return res.json({ success: true, settings: updated });
});

/**
 * Test connection to Resend or Brevo
 */
app.post('/api/email/test-connection', async (req: Request, res: Response) => {
  const { provider } = req.body;
  try {
    const result = await emailService.testConnection(provider);
    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, message: msg });
  }
});

/**
 * Send test email
 */
app.post('/api/email/send-test', async (req: Request, res: Response) => {
  const { to, subject, html, content } = req.body;
  if (!to || !to.includes('@')) {
    return res.status(400).json({ success: false, message: 'Please provide a valid test recipient email address.' });
  }

  try {
    const testSubject = subject || '[Test] FujiFinder Dispatch Preview';
    const emailBody = html || content || `
      <div style="padding: 24px; font-family: sans-serif;">
        <h2 style="color: #111;">FujiFinder Test Email</h2>
        <p>This is a real test email dispatched from the FujiFinder Email System.</p>
        <p>Sent at: ${new Date().toLocaleString()}</p>
      </div>
    `;

    const result = await emailService.sendSingleEmail({
      to,
      subject: testSubject,
      html: emailService.wrapResponsiveEmail(emailBody),
      type: 'test',
    });

    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

/**
 * Campaigns list and creation
 */
app.get('/api/email/campaigns', (req: Request, res: Response) => {
  const campaigns = newsletterStore.getCampaigns();
  return res.json({ success: true, campaigns });
});

app.post('/api/email/campaigns', async (req: Request, res: Response) => {
  const {
    name,
    subject,
    previewText,
    fromName,
    replyTo,
    content,
    templateId,
    audience,
    selectedSubscriberIds,
    testEmailAddress,
  } = req.body;

  if (!subject || !content) {
    return res.status(400).json({ success: false, message: 'Subject and Content are required.' });
  }

  const settings = newsletterStore.getSettings();

  // Create campaign record
  const campaign = newsletterStore.createCampaign({
    name: name || subject,
    subject,
    previewText: previewText || '',
    fromName: fromName || settings.fromName,
    replyTo: replyTo || settings.replyTo,
    content,
    templateId,
    audience: audience || 'all_active',
    selectedSubscriberIds,
    testEmailAddress,
    provider: settings.activeProvider,
    recipientCount: 0,
    status: 'queued',
    sent_at: null,
    metrics: { sent: 0, delivered: 0, failed: 0, opened: 0, clicked: 0 },
  });

  // Start background sending asynchronously (non-blocking)
  const baseUrl = (req.headers['x-forwarded-proto'] && req.headers['host'])
    ? `${req.headers['x-forwarded-proto']}://${req.headers['host']}`
    : 'https://www.fujifinder.my.id';

  emailService.sendCampaign(campaign.id, baseUrl).catch((err) => {
    console.error(`Background campaign dispatch error for ${campaign.id}:`, err);
  });

  return res.json({
    success: true,
    campaign,
    message: 'Campaign queued successfully and is now sending in the background.',
  });
});

/**
 * Templates list, create, update, delete
 */
app.get('/api/email/templates', (req: Request, res: Response) => {
  const templates = newsletterStore.getTemplates();
  return res.json({ success: true, templates });
});

app.post('/api/email/templates', (req: Request, res: Response) => {
  const { name, subject, description, category, htmlContent, variables } = req.body;
  if (!name || !subject || !htmlContent) {
    return res.status(400).json({ success: false, message: 'Name, Subject, and HTML Content are required.' });
  }

  const template = newsletterStore.createTemplate({
    name,
    subject,
    description: description || '',
    category: category || 'custom',
    htmlContent,
    variables: variables || [],
  });

  return res.json({ success: true, template });
});

app.patch('/api/email/templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = newsletterStore.updateTemplate(id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Template not found.' });
  }
  return res.json({ success: true, template: updated });
});

app.delete('/api/email/templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = newsletterStore.deleteTemplate(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Template not found.' });
  }
  return res.json({ success: true, message: 'Template deleted.' });
});

/**
 * Email Activity Logs
 */
app.get('/api/email/logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const logs = newsletterStore.getLogs(limit);
  return res.json({ success: true, logs });
});

/**
 * Webhook handler for Resend / Brevo delivery events
 */
app.post('/api/email/webhook', (req: Request, res: Response) => {
  const payload = req.body;
  // Safely acknowledge webhook
  return res.json({ received: true });
});

// =============================================================
// CMS & SITE BUILDER DATA PERSISTENCE & API LAYER
// =============================================================

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  if (!authHeader) return null;
  if (typeof authHeader === 'string') {
    let token = authHeader.trim();
    if (token.startsWith('Bearer ')) {
      token = token.slice(7).trim();
    }
    token = token.replace(/^["']|["']$/g, '').trim();
    return token || null;
  }
  return null;
}

/**
 * Validate either a local session token or a Supabase Auth access token
 */
async function verifyAdminAuthToken(token: string): Promise<{ valid: boolean; user?: any; error?: string }> {
  if (!token) {
    return { valid: false, error: 'Session token missing.' };
  }

  // 1. Backward compatibility: check local / HMAC session token
  if (cmsStore.validateSessionToken(token)) {
    return { valid: true, user: cmsStore.getAdminUser() };
  }

  // 2. Verify Supabase Auth JWT token
  try {
    const sb = supabaseService.getClient();
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (!error && user && user.email) {
      const email = user.email.toLowerCase();

      // Retrieve role and profile from public.admin_users by auth_id (or email fallback)
      let adminRecord: any = null;
      try {
        const { data: dbUserByAuthId } = await sb
          .from('admin_users')
          .select('*')
          .eq('auth_id', user.id)
          .maybeSingle();

        if (dbUserByAuthId) {
          adminRecord = dbUserByAuthId;
        } else {
          const { data: dbUserByEmail } = await sb
            .from('admin_users')
            .select('*')
            .ilike('email', email)
            .maybeSingle();
          if (dbUserByEmail) adminRecord = dbUserByEmail;
        }
      } catch (dbErr) {
        console.warn('[verifyAdminAuthToken] db admin_users query warning:', dbErr);
      }

      // Default Super Admin privilege if matching default admin email or if recorded as Admin/Super Admin
      const isConfiguredAdminEmail = email === (cmsStore.getAdminUser().email || '').toLowerCase() ||
        email === 'fujifinderbusiness@gmail.com';
      const role = adminRecord?.role || (isConfiguredAdminEmail ? 'Super Admin' : null);

      if (role === 'Super Admin' || role === 'Admin') {
        const adminProfile = {
          id: adminRecord?.id || user.id,
          email: adminRecord?.email || user.email,
          name: adminRecord?.name || user.user_metadata?.name || 'Admin FujiFinder',
          role: role,
          avatar: adminRecord?.avatar || user.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
          lastLogin: new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        return { valid: true, user: adminProfile };
      }

      return { valid: false, error: 'Akses ditolak: Akun tidak memiliki hak akses Super Admin atau Admin.' };
    }
  } catch (err: any) {
    console.warn('[verifyAdminAuthToken] Supabase getUser exception:', err?.message || err);
  }

  return { valid: false, error: 'Unauthorized. Admin session expired or invalid. Please log in again.' };
}

async function requireAdminAuth(req: Request, res: Response, next: any) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Admin session token missing. Please log in again.',
    });
  }

  const result = await verifyAdminAuthToken(token);
  if (!result.valid) {
    return res.status(401).json({
      success: false,
      error: result.error || 'Unauthorized. Admin session expired or invalid. Please log in again.',
    });
  }

  (req as any).adminUser = result.user;
  next();
}

/**
 * 1. PUBLIC WEBSITE: Get all published data
 * Returns only published pages with publishedSections, published cameras, published articles, and site settings.
 * Includes ETag and cache headers for reliable invalidation.
 */
app.get('/api/site/published', (req: Request, res: Response) => {
  const data = cmsStore.getPublishedSiteData();
  const etag = `"v${data.published_version}"`;

  res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  res.set('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  return res.json({ success: true, ...data });
});

/**
 * 2. PUBLIC WEBSITE: Get current published version
 * Enables instantaneous polling or revalidation detection without heavy payloads.
 */
app.get('/api/version', (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-cache');
  return res.json({ success: true, ...cmsStore.getVersion() });
});

/**
 * 3. PUBLIC WEBSITE: Get single published page by slug
 */
app.get('/api/pages/:slug', (req: Request, res: Response) => {
  const page = cmsStore.getPublishedPageBySlug(req.params.slug);
  if (!page) {
    return res.status(404).json({ success: false, error: 'Page not found or not published' });
  }
  res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return res.json({ success: true, page });
});

/**
 * 4. PUBLIC & ADMIN: Admin Login
 */
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  if (!cmsStore.validateCredentials(email, password)) {
    return res.status(401).json({ success: false, error: 'Email atau kata sandi admin tidak valid.' });
  }

  const session = cmsStore.createSession(email);
  return res.json({ success: true, ...session });
});

/**
 * 5. ADMIN: Logout
 */
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (token) cmsStore.removeSession(token);
  return res.json({ success: true });
});

/**
 * 5b. ADMIN: Verify Session Token (supports Supabase Auth tokens and local tokens)
 */
app.get('/api/auth/verify', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, authenticated: false, error: 'Session token missing.' });
  }
  const result = await verifyAdminAuthToken(token);
  if (!result.valid) {
    return res.status(401).json({ success: false, authenticated: false, error: result.error || 'Session expired or invalid.' });
  }
  return res.json({ success: true, authenticated: true, user: result.user });
});

/**
 * 6. PUBLIC: Affiliate click tracking
 */
app.post('/api/affiliate/click', (req: Request, res: Response) => {
  if (req.body && req.body.cameraId) {
    cmsStore.recordAffiliateClick(req.body);
  }
  return res.json({ success: true });
});

/**
 * 7. ADMIN: Get full dataset (drafts, revisions, clicks, full builder pages)
 */
app.get('/api/site/admin', requireAdminAuth, (req: Request, res: Response) => {
  const adminData = cmsStore.getAdminSiteData();
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true, ...adminData });
});

/**
 * 8. ADMIN: Save page draft
 */
app.post('/api/pages/save-draft', requireAdminAuth, (req: Request, res: Response) => {
  const { pageId, sections, author } = req.body || {};
  if (!pageId || !Array.isArray(sections)) {
    return res.status(400).json({ success: false, error: 'Invalid page ID or sections array.' });
  }
  try {
    const result = cmsStore.savePageDraft(pageId, sections, author);
    return res.json({
      success: true,
      message: 'Draft saved successfully.',
      ...result,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to save draft' });
  }
});

/**
 * 9. ADMIN: Publish page
 */
app.post('/api/pages/publish', requireAdminAuth, (req: Request, res: Response) => {
  const { pageId, pageData, author } = req.body || {};
  if (!pageId) {
    return res.status(400).json({ success: false, error: 'Page ID is required.' });
  }
  try {
    const result = cmsStore.publishPage(pageId, pageData, author);
    return res.json({
      success: true,
      message: 'Changes published successfully.',
      ...result,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to publish page' });
  }
});

/**
 * 10. ADMIN: Unpublish page
 */
app.post('/api/pages/unpublish', requireAdminAuth, (req: Request, res: Response) => {
  const { pageId } = req.body || {};
  if (!pageId) {
    return res.status(400).json({ success: false, error: 'Page ID is required.' });
  }
  try {
    const result = cmsStore.unpublishPage(pageId);
    return res.json({
      success: true,
      message: 'Page unpublished successfully.',
      ...result,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to unpublish page' });
  }
});

/**
 * 11. ADMIN: Restore page revision
 */
app.post('/api/pages/restore-version', requireAdminAuth, (req: Request, res: Response) => {
  const { pageId, revisionId } = req.body || {};
  if (!pageId || !revisionId) {
    return res.status(400).json({ success: false, error: 'pageId and revisionId are required.' });
  }
  try {
    const result = cmsStore.restorePageRevision(pageId, revisionId);
    return res.json({
      success: true,
      message: 'Version restored successfully.',
      ...result,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to restore revision' });
  }
});

/**
 * 12. ADMIN: Create page
 */
app.post('/api/pages', requireAdminAuth, (req: Request, res: Response) => {
  const page = req.body.page;
  if (!page || !page.id || !page.title) {
    return res.status(400).json({ success: false, error: 'Invalid page structure.' });
  }
  const created = cmsStore.createPage(page);
  return res.json({ success: true, page: created });
});

/**
 * 13. ADMIN: Update page metadata
 */
app.put('/api/pages/:id', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const updated = cmsStore.updatePage(req.params.id, req.body.updates || req.body);
    return res.json({ success: true, page: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 14. ADMIN: Delete page
 */
app.delete('/api/pages/:id', requireAdminAuth, (req: Request, res: Response) => {
  cmsStore.deletePage(req.params.id);
  return res.json({ success: true, message: 'Page deleted successfully.' });
});

/**
 * 15. ADMIN: Save global design settings
 */
app.get('/api/builder/global-design', (req: Request, res: Response) => {
  const globalDesign = cmsStore.getGlobalDesign();
  return res.json({ success: true, globalDesign });
});

app.post('/api/builder/global-design', requireAdminAuth, (req: Request, res: Response) => {
  const { globalDesign } = req.body || {};
  const design = globalDesign || req.body;
  if (!design) {
    return res.status(400).json({ success: false, error: 'globalDesign is required.' });
  }
  const result = cmsStore.saveGlobalDesign(design);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/builder/global-design', requireAdminAuth, (req: Request, res: Response) => {
  const { globalDesign } = req.body || {};
  const design = globalDesign || req.body;
  if (!design) {
    return res.status(400).json({ success: false, error: 'globalDesign is required.' });
  }
  const result = cmsStore.saveGlobalDesign(design);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

/**
 * 16. ADMIN: Save reusable sections
 */
app.get('/api/builder/reusable-sections', (req: Request, res: Response) => {
  const reusableSections = cmsStore.getReusableSections();
  return res.json({ success: true, reusableSections });
});

app.post('/api/builder/reusable-sections', requireAdminAuth, (req: Request, res: Response) => {
  const { sections } = req.body || {};
  const secList = Array.isArray(sections) ? sections : req.body;
  if (!Array.isArray(secList)) {
    return res.status(400).json({ success: false, error: 'sections array is required.' });
  }
  const result = cmsStore.saveReusableSections(secList);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/builder/reusable-sections', requireAdminAuth, (req: Request, res: Response) => {
  const { sections } = req.body || {};
  const secList = Array.isArray(sections) ? sections : req.body;
  if (!Array.isArray(secList)) {
    return res.status(400).json({ success: false, error: 'sections array is required.' });
  }
  const result = cmsStore.saveReusableSections(secList);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

/**
 * 17. ADMIN: Bulk sync builder data
 */
app.post('/api/builder/sync', requireAdminAuth, (req: Request, res: Response) => {
  const { pages, globalDesign, reusableSections, revisions } = req.body || {};
  if (!Array.isArray(pages)) {
    return res.status(400).json({ success: false, error: 'pages array is required.' });
  }
  const result = cmsStore.syncAllBuilderData(pages, globalDesign, reusableSections || [], revisions || []);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

/**
 * 18. ARTICLES CRUD (Load, Create, Update, Delete)
 */
app.get('/api/articles', (req: Request, res: Response) => {
  const articles = cmsStore.getArticles();
  return res.json({ success: true, articles });
});

app.get('/api/articles/:id', (req: Request, res: Response) => {
  const article = cmsStore.getArticleById(req.params.id);
  if (!article) {
    return res.status(404).json({ success: false, error: 'Article not found.' });
  }
  return res.json({ success: true, article });
});

app.post('/api/articles', requireAdminAuth, (req: Request, res: Response) => {
  const { article } = req.body || {};
  const artToSave = article || req.body;
  if (!artToSave || !artToSave.id || !artToSave.title) {
    return res.status(400).json({ success: false, error: 'Valid article object is required.' });
  }
  const result = cmsStore.saveArticle(artToSave);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/articles/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { article } = req.body || {};
  const artToSave = article || req.body;
  if (!artToSave || !artToSave.title) {
    return res.status(400).json({ success: false, error: 'Valid article object is required.' });
  }
  artToSave.id = req.params.id || artToSave.id;
  const result = cmsStore.saveArticle(artToSave);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/articles', requireAdminAuth, (req: Request, res: Response) => {
  const { article } = req.body || {};
  const artToSave = article || req.body;
  if (!artToSave || !artToSave.id || !artToSave.title) {
    return res.status(400).json({ success: false, error: 'Valid article object is required.' });
  }
  const result = cmsStore.saveArticle(artToSave);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.delete('/api/articles/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = cmsStore.deleteArticle(req.params.id);
  return res.json({ success: true, message: 'Article deleted successfully.', ...result });
});

/**
 * 19. CAMERAS CRUD (Load, Create, Update, Delete)
 */
app.get('/api/cameras', (req: Request, res: Response) => {
  const cameras = cmsStore.getCameras();
  return res.json({ success: true, cameras });
});

app.get('/api/cameras/:id', (req: Request, res: Response) => {
  const camera = cmsStore.getCameraById(req.params.id);
  if (!camera) {
    return res.status(404).json({ success: false, error: 'Camera not found.' });
  }
  return res.json({ success: true, camera });
});

app.post('/api/cameras', requireAdminAuth, (req: Request, res: Response) => {
  const { camera } = req.body || {};
  const camToSave = camera || req.body;
  if (!camToSave || !camToSave.id || !camToSave.name) {
    return res.status(400).json({ success: false, error: 'Valid camera object is required.' });
  }
  const result = cmsStore.saveCamera(camToSave);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/cameras/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { camera } = req.body || {};
  const camToSave = camera || req.body;
  if (!camToSave || !camToSave.name) {
    return res.status(400).json({ success: false, error: 'Valid camera object is required.' });
  }
  camToSave.id = req.params.id || camToSave.id;
  const result = cmsStore.saveCamera(camToSave);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/cameras', requireAdminAuth, (req: Request, res: Response) => {
  const { camera } = req.body || {};
  const camToSave = camera || req.body;
  if (!camToSave || !camToSave.id || !camToSave.name) {
    return res.status(400).json({ success: false, error: 'Valid camera object is required.' });
  }
  const result = cmsStore.saveCamera(camToSave);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.delete('/api/cameras/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = cmsStore.deleteCamera(req.params.id);
  return res.json({ success: true, message: 'Camera deleted successfully.', ...result });
});

/**
 * 20. SITE & HOMEPAGE SETTINGS
 */
app.get('/api/settings', (req: Request, res: Response) => {
  const settings = cmsStore.getSiteSettings();
  return res.json({ success: true, settings, siteSettings: settings });
});

app.post('/api/settings', requireAdminAuth, (req: Request, res: Response) => {
  const { settings } = req.body || {};
  const s = settings || req.body;
  if (!s) {
    return res.status(400).json({ success: false, error: 'Settings object is required.' });
  }
  const result = cmsStore.updateSiteSettings(s);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/settings', requireAdminAuth, (req: Request, res: Response) => {
  const { settings } = req.body || {};
  const s = settings || req.body;
  if (!s) {
    return res.status(400).json({ success: false, error: 'Settings object is required.' });
  }
  const result = cmsStore.updateSiteSettings(s);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.get('/api/home-settings', (req: Request, res: Response) => {
  const settings = cmsStore.getHomeSettings();
  return res.json({ success: true, settings, homeSettings: settings });
});

app.post('/api/home-settings', requireAdminAuth, (req: Request, res: Response) => {
  const { settings } = req.body || {};
  const s = settings || req.body;
  if (!s) {
    return res.status(400).json({ success: false, error: 'Homepage settings object is required.' });
  }
  const result = cmsStore.updateHomeSettings(s);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

app.put('/api/home-settings', requireAdminAuth, (req: Request, res: Response) => {
  const { settings } = req.body || {};
  const s = settings || req.body;
  if (!s) {
    return res.status(400).json({ success: false, error: 'Homepage settings object is required.' });
  }
  const result = cmsStore.updateHomeSettings(s);
  return res.json({ success: true, message: 'Changes published successfully.', ...result });
});

/**
 * 21. MEDIA ASSETS & IMAGE UPLOAD
 */
app.get('/api/media', requireAdminAuth, (req: Request, res: Response) => {
  const mediaAssets = cmsStore.getMediaAssets();
  return res.json({ success: true, mediaAssets, assets: mediaAssets });
});

app.post('/api/media', requireAdminAuth, (req: Request, res: Response) => {
  const { asset } = req.body || {};
  const a = asset || req.body;
  if (!a || !a.url) {
    return res.status(400).json({ success: false, error: 'Valid media asset is required.' });
  }
  if (!a.id) {
    a.id = 'm-' + Date.now();
  }
  const created = cmsStore.addMediaAsset(a);
  return res.json({ success: true, asset: created });
});

app.delete('/api/media/:id', requireAdminAuth, (req: Request, res: Response) => {
  cmsStore.deleteMediaAsset(req.params.id);
  return res.json({ success: true });
});

// Image upload handlers for file uploads and base64 images
const handleImageUpload = (req: Request, res: Response) => {
  const body = req.body || {};
  const image = body.image || body.url || body.file || body.data;
  const title = body.title || body.name || 'Uploaded Media';
  const category = body.category || 'camera';

  if (!image) {
    return res.status(400).json({ success: false, error: 'Image data or URL is required.' });
  }

  const newAsset: MediaAsset = {
    id: 'm-' + Date.now(),
    title,
    url: image,
    category: (category as any) || 'camera',
    dimensions: body.dimensions || '1200x800',
    fileSize: body.fileSize || 'Standard',
    uploadedAt: new Date().toISOString().split('T')[0],
  };

  const created = cmsStore.addMediaAsset(newAsset);
  return res.json({
    success: true,
    url: created.url,
    asset: created,
    message: 'Image uploaded successfully.',
  });
};

app.post('/api/upload', requireAdminAuth, handleImageUpload);
app.post('/api/upload/image', requireAdminAuth, handleImageUpload);
app.post('/api/media/upload', requireAdminAuth, handleImageUpload);

/**
 * 22. ADMIN: Update Admin Account
 */
app.post('/api/auth/account', requireAdminAuth, (req: Request, res: Response) => {
  const updated = cmsStore.updateAdminAccount(req.body);
  return res.json({ success: true, message: 'Admin account updated successfully.', account: updated });
});

app.put('/api/auth/account', requireAdminAuth, (req: Request, res: Response) => {
  const updated = cmsStore.updateAdminAccount(req.body);
  return res.json({ success: true, message: 'Admin account updated successfully.', account: updated });
});

/**
 * 23. ADMIN: Reset to demo state
 */
app.post('/api/site/reset', requireAdminAuth, (req: Request, res: Response) => {
  const result = cmsStore.resetToDemo();
  return res.json({ success: true, message: 'Site reset to initial clean demo state.', ...result });
});

// -------------------------------------------------------------
// SUPABASE DATABASE & TABLE SYNC ENDPOINTS
// -------------------------------------------------------------

/**
 * 27. SUPABASE: Check live connection status & table statistics
 */
app.get('/api/supabase/status', async (req: Request, res: Response) => {
  try {
    const testResult = await supabaseService.checkConnection();
    const status = supabaseService.getStatus();
    return res.json({
      success: true,
      ...status,
      test: testResult,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to check Supabase status',
    });
  }
});

/**
 * 28. SUPABASE: Trigger on-demand sync from Supabase tables
 */
app.post('/api/supabase/sync', async (req: Request, res: Response) => {
  try {
    await Promise.all([
      cmsStore.initFromSupabase(),
      newsletterStore.initFromSupabase(),
    ]);
    const status = supabaseService.getStatus();
    return res.json({
      success: true,
      message: 'Successfully synchronized data from all Supabase tables',
      ...status,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to sync with Supabase',
    });
  }
});

/**
 * 29. SUPABASE: Push all existing data to Supabase tables
 */
app.post('/api/supabase/push-all', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const siteData = cmsStore.getAdminSiteData();
    const subs = newsletterStore.getSubscribers();
    const campaigns = newsletterStore.getCampaigns();
    const logs = newsletterStore.getLogs(50);

    let savedCameras = 0;
    for (const cam of siteData.cameras) {
      const ok = await supabaseService.saveCamera(cam);
      if (ok) savedCameras++;
    }

    let savedArticles = 0;
    for (const art of siteData.articles) {
      const ok = await supabaseService.saveArticle(art);
      if (ok) savedArticles++;
    }

    let savedMedia = 0;
    for (const med of siteData.mediaAssets) {
      const ok = await supabaseService.saveMediaAsset(med);
      if (ok) savedMedia++;
    }

    let savedSubs = 0;
    for (const sub of subs) {
      const ok = await supabaseService.saveSubscriber(sub);
      if (ok) savedSubs++;
    }

    let savedCampaigns = 0;
    for (const cmp of campaigns) {
      const ok = await supabaseService.saveEmailCampaign(cmp);
      if (ok) savedCampaigns++;
    }

    let savedClicks = 0;
    for (const click of siteData.affiliateClicks) {
      const ok = await supabaseService.recordAffiliateClick(click);
      if (ok) savedClicks++;
    }

    await supabaseService.checkConnection();

    return res.json({
      success: true,
      message: 'All existing local data pushed to Supabase tables successfully',
      results: {
        cameras: `${savedCameras}/${siteData.cameras.length}`,
        articles: `${savedArticles}/${siteData.articles.length}`,
        subscribers: `${savedSubs}/${subs.length}`,
        mediaAssets: `${savedMedia}/${siteData.mediaAssets.length}`,
        campaigns: `${savedCampaigns}/${campaigns.length}`,
        affiliateClicks: `${savedClicks}/${siteData.affiliateClicks.length}`,
      },
      currentSupabaseStats: supabaseService.getStatus(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to push all data to Supabase',
    });
  }
});

// -------------------------------------------------------------
// VITE DEV MIDDLEWARE / STATIC ASSET SERVING
// -------------------------------------------------------------
async function startServer() {
  // Initialize from Supabase cloud database
  try {
    console.log('[FujiFinder Server] Connecting to Supabase project zxzitnulvhbnkjvfsmig...');
    await Promise.all([
      cmsStore.initFromSupabase(),
      newsletterStore.initFromSupabase(),
    ]);
    console.log('[FujiFinder Server] Initialized from Supabase tables successfully');
  } catch (err: any) {
    console.error('[FujiFinder Server] Supabase initial load notice:', err.message);
  }

  if (process.env.NODE_ENV !== 'production') {

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FujiFinder Server] Running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
export { app };

if (!process.env.VERCEL) {
  startServer();
}
