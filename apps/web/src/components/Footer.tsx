import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

/** Datasheet footer: one rule, wordmark, a line of machine links in mono. */
export function Footer({ surface = 'paper' }: { surface?: 'paper' | 'bench' }) {
  const bench = surface === 'bench';
  const link = cn('transition-colors duration-fast hover:underline', bench ? 'text-bench-ink-2 hover:text-bench-ink' : 'text-ink-3 hover:text-ink');
  return (
    <footer className={cn('mx-auto w-full max-w-container px-4 pb-8 pt-6 md:px-6', bench ? 'on-bench border-t border-bench-rule' : 'border-t border-rule')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-baseline md:justify-between">
        <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
          <p className={cn('wide-112 font-sans text-h3 font-bold', bench ? 'text-bench-ink' : 'text-ink')}>Rent a Shell</p>
          <p className={cn('text-small', bench ? 'text-bench-ink-2' : 'text-ink-2')}>Real hardware, rented by the minute. From Tucumán, Argentina. Powered by Solana.</p>
        </div>
        <div className={cn('flex flex-wrap gap-x-5 gap-y-2 font-mono text-mono-xs uppercase')}>
          <Link to="/agents" className={link}>Agents</Link>
          <a href="/llms.txt" className={link}>llms.txt</a>
          <a href="/.well-known/agent.json" className={link}>agent.json</a>
          <a href="https://github.com/francoperez03/rent-a-shell" className={link} rel="noopener">Source</a>
        </div>
      </div>
    </footer>
  );
}
