import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';

export default function NotFound() {
  return (
    <main className="dot-grid mx-auto grid min-h-viewport max-w-container place-items-center px-4 pt-16 text-center">
      <div>
        <Readout label="Status" value="404" className="items-center" />
        <h1 className="wide-106 mt-6 text-h1">This page does not exist.</h1>
        <p className="mt-3 text-body text-ink-2">The shells live on /shells; the API lives on the gateway.</p>
        <Button as="link" href="/" variant="secondary" label="Back to home" className="mt-8" />
      </div>
    </main>
  );
}
