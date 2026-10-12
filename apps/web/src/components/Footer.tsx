import { Link } from 'react-router-dom';

/** Footer compacto de landing2 sobre navy: wordmark, bajada y línea mono con los links para máquinas. */
export function Footer() {
  return (
    <footer className="relative z-10 mx-auto w-full max-w-container px-5 pb-8 md:px-8 md:pb-10">
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-5">
        <p className="font-display text-[22px] leading-none text-white">Rent a Shell</p>
        <p className="font-sans text-[15px] leading-snug text-white/75">Hardware real, alquilado por bloques. Desde Salta.</p>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-white/15 pt-4 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">El Tucu · brazo de 4 ejes · Salta, AR</p>
        <div className="flex gap-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
          <Link to="/agents" className="transition-colors duration-fast hover:text-white">Agentes</Link>
          <a href="/llms.txt" className="transition-colors duration-fast hover:text-white">llms.txt</a>
          <a href="/.well-known/agent.json" className="transition-colors duration-fast hover:text-white">agent.json</a>
        </div>
      </div>
    </footer>
  );
}
