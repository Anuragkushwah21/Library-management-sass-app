import { ArrowUpRight, Mail, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PublicAd } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';

/** The fields the card renders — the admin preview passes its form values in. */
export type AdCardData = Pick<
  PublicAd,
  | 'title'
  | 'description'
  | 'imageUrl'
  | 'linkUrl'
  | 'ctaLabel'
  | 'advertiserName'
  | 'badgeText'
  | 'phone'
  | 'whatsapp'
  | 'email'
>;

const digits = (v: string) => v.replace(/\D/g, '');

/** 10-digit numbers are taken as Indian mobiles; anything longer already has a country code. */
function whatsappUrl(number: string, title: string): string {
  const d = digits(number);
  const full = d.length === 10 ? `91${d}` : d;
  const text = encodeURIComponent(`Hi, I saw your ad "${title}" on LibraryMS and I'm interested.`);
  return `https://wa.me/${full}?text=${text}`;
}

function telUrl(number: string): string {
  const trimmed = number.trim();
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits(trimmed)}`;
}

function mailUrl(email: string, title: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Enquiry: ${title}`)}`;
}

export function AdCard({ ad, wide }: { ad: AdCardData; wide?: boolean }) {
  // WhatsApp first: most visitors here prefer it, and with three buttons it
  // takes the full-width row so no label gets truncated
  const contacts = [
    ad.whatsapp && {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: MessageCircle,
      href: whatsappUrl(ad.whatsapp, ad.title),
      external: true,
    },
    ad.phone && { key: 'call', label: 'Call', icon: Phone, href: telUrl(ad.phone) },
    ad.email && { key: 'email', label: 'Email', icon: Mail, href: mailUrl(ad.email, ad.title) },
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: typeof Phone;
    href: string;
    external?: boolean;
  }[];

  // Main button: the website link, or — when the admin wrote button text but
  // gave no link — the first contact route, so "Buy now" always does something
  const fallback = !ad.linkUrl && ad.ctaLabel ? contacts[0] : undefined;
  const primary = ad.linkUrl
    ? { href: ad.linkUrl, icon: ArrowUpRight, external: true, sponsored: true }
    : fallback
    ? { href: fallback.href, icon: fallback.icon, external: fallback.external, sponsored: false }
    : null;
  const secondary = fallback ? contacts.slice(1) : contacts;

  const hasActions = Boolean(primary) || secondary.length > 0;

  return (
    <article
      className={cn(
        'group flex h-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md',
        wide ? 'flex-col md:flex-row' : 'flex-col'
      )}
    >
      <div
        className={cn(
          'relative shrink-0 overflow-hidden bg-muted',
          wide ? 'aspect-[16/9] md:aspect-auto md:w-[52%]' : 'aspect-[16/9]'
        )}
      >
        {ad.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.imageUrl}
            alt={ad.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          // No image: branded monogram panel so cards in a row stay the same shape
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-transparent [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-card text-2xl font-bold text-primary shadow-sm sm:h-20 sm:w-20 sm:text-3xl">
              {(ad.advertiserName || ad.title || 'A').trim().charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        {ad.badgeText && (
            <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow">
              {ad.badgeText}
            </span>
        )}
      </div>

      <div className={cn('flex flex-1 flex-col p-5 sm:p-6', wide && 'md:justify-center md:p-10')}>
        <div className="flex flex-wrap items-center gap-2">
          {ad.advertiserName && (
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {ad.advertiserName}
            </span>
          )}
        </div>

        <h3
          className={cn(
            'mt-1.5 text-balance font-bold tracking-tight',
            wide ? 'text-2xl sm:text-3xl' : 'text-lg'
          )}
        >
          {ad.title || 'Your ad title'}
        </h3>

        {ad.description && (
          <p
            className={cn(
              'mt-2 text-pretty leading-relaxed text-muted-foreground',
              wide ? 'text-base' : 'line-clamp-3 text-sm'
            )}
          >
            {ad.description}
          </p>
        )}

        {hasActions && (
          // mt-auto pins the buttons to the bottom so a row of cards lines up
          // Wide (single ad): one row right under the text, since the body is vertically centred
          <div
            className={cn(
              'mt-auto flex flex-col gap-2.5 pt-5',
              wide && 'md:mt-0 md:flex-row md:flex-wrap md:items-center md:pt-7'
            )}
          >
            {primary && (
              <Button asChild size="lg" className={cn('w-full', wide && 'md:w-auto md:self-start')}>
                <a
                  href={primary.href}
                  {...(primary.external
                    ? {
                        target: '_blank',
                        rel: primary.sponsored
                          ? 'noopener noreferrer sponsored'
                          : 'noopener noreferrer',
                      }
                    : {})}
                >
                  {primary.sponsored ? null : <primary.icon className="mr-1.5 h-4 w-4" />}
                  {ad.ctaLabel || 'Learn more'}
                  {primary.sponsored && <ArrowUpRight className="ml-1.5 h-4 w-4" />}
                </a>
              </Button>
            )}

            {secondary.length > 0 && (
              <div
                className={cn(
                  'grid gap-2',
                  secondary.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                  wide && 'md:flex md:flex-wrap md:gap-2.5'
                )}
              >
                {secondary.map(({ key, label, icon: Icon, href, external }, i) => (
                  <Button
                    key={key}
                    asChild
                    variant="outline"
                    className={cn(
                      'min-w-0 px-2',
                      wide && 'md:h-10 md:px-4',
                      secondary.length === 3 && i === 0 && 'col-span-2',
                      key === 'whatsapp' &&
                        'border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                    )}
                  >
                    <a
                      href={href}
                      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      aria-label={`${label} ${ad.advertiserName || ad.title}`}
                    >
                      <Icon className="mr-1.5 h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Home page ad space — hidden entirely when nothing is live. */
export function AdSpace({ ads }: { ads: PublicAd[] }) {
  if (ads.length === 0) return null;

  return (
    <section aria-label="Sponsored" className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Featured offers
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            From our partners
          </h2>
        </div>
        <span className="rounded-md border border-border/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Sponsored
        </span>
      </div>
      {ads.length === 1 ? (
        <AdCard ad={ads[0]} wide />
      ) : (
        <div className={cn('grid gap-5 sm:grid-cols-2', ads.length >= 3 && 'lg:grid-cols-3')}>
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </section>
  );
}
