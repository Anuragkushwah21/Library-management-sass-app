// lib/marketing-data.ts — server-only reads for the public home page
import { connectDB } from '@/lib/db';
import { Plan } from '@/lib/models/Plan';
import { Advertisement } from '@/lib/models/Advertisement';
import { DEFAULT_TRIAL_DAYS, getTrialDays } from '@/lib/services/access';

export interface PublicPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  isPopular: boolean;
}

export interface PublicAd {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  ctaLabel: string;
  advertiserName: string;
  badgeText: string;
  phone: string;
  whatsapp: string;
  email: string;
}

export interface HomeData {
  plans: PublicPlan[];
  ads: PublicAd[];
  trialDays: number;
}

/**
 * Never throws — if the DB is down the marketing page still renders,
 * just without pricing and ads.
 */
export async function getHomeData(): Promise<HomeData> {
  try {
    await connectDB();
    const now = new Date();

    const [plans, ads, trialDays] = await Promise.all([
      Plan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean<any[]>(),
      Advertisement.find({
        isActive: true,
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        ],
      })
        .sort({ sortOrder: 1, createdAt: -1 })
        .limit(6)
        .lean<any[]>(),
      getTrialDays(),
    ]);

    return {
      trialDays,
      plans: plans.map((p) => ({
        id: String(p._id),
        name: p.name,
        description: p.description ?? '',
        price: p.price,
        currency: p.currency ?? 'INR',
        durationDays: p.durationDays,
        features: p.features ?? [],
        isPopular: Boolean(p.isPopular),
      })),
      ads: ads.map((a) => ({
        id: String(a._id),
        title: a.title,
        description: a.description ?? '',
        imageUrl: a.imageUrl ?? '',
        linkUrl: a.linkUrl ?? '',
        ctaLabel: a.ctaLabel ?? '',
        advertiserName: a.advertiserName ?? '',
        badgeText: a.badgeText ?? '',
        phone: a.phone ?? '',
        whatsapp: a.whatsapp ?? '',
        email: a.email ?? '',
      })),
    };
  } catch (error) {
    console.error('[Home] Failed to load plans/ads:', error);
    return { plans: [], ads: [], trialDays: DEFAULT_TRIAL_DAYS };
  }
}
