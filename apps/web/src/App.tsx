import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Nav } from '@/components/Nav';
import { setGateway } from '@/lib/api';
import ShellPage from '@/pages/Shell';
import SessionPage from '@/pages/Session';
import AgentsPage from '@/pages/Agents';

// Landing pulls in three (orb) and Checkout the QR generator: each loads only on its route.
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
    <main className="mx-auto grid min-h-viewport max-w-container place-items-center px-5 text-center text-white">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">404</p>
        <h1 className="mt-4 font-display text-[40px] font-light">This page does not exist.</h1>
        <a href="/" className="mt-6 inline-block font-mono text-[12px] uppercase tracking-[0.16em] text-white/70 underline-offset-4 hover:underline">Back to home</a>
      </div>
    </main>
  );
}
