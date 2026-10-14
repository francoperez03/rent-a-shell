'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Roll } from '@/motion-kit/split';
import { shellHref, useShells } from '@/lib/api';
import { StatusDot } from './StatusDot';

const LINKS = [{ to: '/agents', label: 'Agents' }];

/** Instrument nameplate: wordmark, links and the live status of shell #1. Paper by default, bench on the console. */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const bench = pathname === '/session';
  const { data: shells } = useShells();
  const first = shells?.[0];

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 border-b transition-colors duration-base', bench ? 'on-bench border-bench-rule bg-bench text-bench-ink' : cn('border-rule bg-paper text-ink', !scrolled && 'border-transparent'))}>
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-container items-center justify-between gap-6 px-4 md:px-6">
        <Link href="/" className="wide-112 font-sans text-[1.375rem] font-bold leading-none tracking-[-0.02em]">
          Rent a Shell
        </Link>
        <div className="flex items-center gap-6 leading-none md:gap-8">
          {first && <StatusDot status={first.status} surface={bench ? 'bench' : 'paper'} className="hidden leading-none sm:inline-flex" />}
          <ul className="flex items-center gap-5 md:gap-6">
            {[...(first ? [{ to: shellHref(first), label: first.name }] : []), ...LINKS].map((l) => (
              <li key={l.to}>
                <Link href={l.to} className={cn('roll-parent font-mono text-mono uppercase transition-colors duration-base', bench ? 'text-bench-ink-2 hover:text-bench-ink' : 'text-ink-2 hover:text-ink')}>
                  <Roll text={l.label} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}
