import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Nav } from '@/components/Nav';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { setGateway } from '@/lib/api';
import ShellPage from '@/pages/Shell';
import SessionPage from '@/pages/Session';
import AgentsPage from '@/pages/Agents';

// Landing and Checkout (QR generator) load only on their route.
const Landing = lazy(() => import('@/pages/Landing'));
const CheckoutPage = lazy(() => import('@/pages/Checkout'));

/** On navigation: scroll to the anchor if there is a hash, otherwise to the top. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      // the section may mount one frame later
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    } else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  // ?gw=<gateway> comes from the hub catalog: set the Forger's gateway before any query fires
  const gw = new URLSearchParams(useLocation().search).get('gw');
  if (gw) setGateway(gw);
  return (
    <>
      <ScrollManager />
      <Nav />
      <Suspense fallback={<div className="min-h-viewport" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/shells/:id" element={<ShellPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

function NotFound() {
  return (
    <main className="dot-grid mx-auto grid min-h-viewport max-w-container place-items-center px-4 pt-16 text-center">
      <div>
        <Readout label="Status" value="404" className="items-center" />
        <h1 className="wide-106 mt-6 text-h1">This page does not exist.</h1>
        <p className="mt-3 text-body text-ink-2">The shells live on the home page; the API lives on the gateway.</p>
        <Button as="link" to="/" variant="secondary" label="Back to home" className="mt-8" />
      </div>
    </main>
  );
}
