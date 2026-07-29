import Link from 'next/link';
import { Logo } from '@/components/logo';

const GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/#features', label: 'Features' },
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/register', label: 'Get started' },
      { href: '/login', label: 'Sign in' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Logo size={32} />
              <span className="text-[15px] font-semibold tracking-tight">
                Library<span className="text-muted-foreground">MS</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Organize. Manage. Empower knowledge. Handle your library’s
              students, books and seats from one place.
            </p>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Library Management System. All
            rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built with Next.js &amp; MongoDB
          </p>
        </div>
      </div>
    </footer>
  );
}
