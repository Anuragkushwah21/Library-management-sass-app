import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  /**
   * `mark`  — emblem only (headers, sidebars, tight spaces)
   * `full`  — full lockup with wordmark + tagline (auth pages, hero)
   */
  variant?: 'mark' | 'full';
  /** Rendered size in px (square) */
  size?: number;
  /** Optional text label rendered next to the mark */
  label?: string;
  sublabel?: string;
  className?: string;
  priority?: boolean;
}

export function Logo({
  variant = 'mark',
  size = 36,
  label,
  sublabel,
  className,
  priority = false,
}: LogoProps) {
  const src = variant === 'full' ? '/logo-full.png' : '/logo-mark.png';

  const image = (
    <Image
      src={src}
      alt="Library Management System"
      width={size}
      height={size}
      priority={priority}
      className="object-contain"
      // next.config sets images.unoptimized, so these PNGs are pre-resized
      // and palette-compressed (956 KB source down to 32 KB)
    />
  );

  if (!label) {
    return <span className={cn('inline-flex shrink-0', className)}>{image}</span>;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5 min-w-0', className)}>
      <span className="shrink-0">{image}</span>
      <span className="min-w-0">
        <span className="block truncate font-bold leading-tight">{label}</span>
        {sublabel && (
          <span className="block truncate text-xs text-muted-foreground">
            {sublabel}
          </span>
        )}
      </span>
    </span>
  );
}
