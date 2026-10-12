import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Roll } from '@/motion-kit/split';

const LINKS = [
  { to: '/#shells', label: 'Shells' },
  { to: '/agents', label: 'Agents' },
];

/**
 * landing2 nav: Fraunces wordmark and two links with roll. Fixed, transparent,
 * gains blur on scroll. Always on dark (the site opens and closes in navy).
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        className={cn('absolute inset-0 border-b border-transparent transition-colors duration-base ease-out-quint', scrolled && 'border-white/10 bg-[rgba(0,12,41,0.92)] backdrop-blur-md')}
      />
      <nav aria-label="Main" className="relative mx-auto flex h-[72px] w-full max-w-container items-center justify-between px-5 md:h-[84px] md:px-8">
        <Link to="/" className="pointer-events-auto font-display text-[24px] font-medium tracking-[-0.01em] text-white md:text-[28px]">
          Rent a Shell
        </Link>
        <ul className="pointer-events-auto flex items-center gap-6">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className="roll-parent font-sans text-[13px] font-medium uppercase tracking-[0.08em] text-white/80 transition-colors duration-base hover:text-white">
                <Roll text={l.label} />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
