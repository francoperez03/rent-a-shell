import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { reducedMotion } from './gsap';

// Orb líquido en R3F: quad de pantalla completa + ShaderMaterial (fbm + domain warping) con uniforms
// u_mouse (posición suavizada en el espacio del orb, deforma el warp) y u_scroll (avanza el flujo).
// Patrón toolbox "objeto líquido continuo". Paleta medida en offbrand analysis.md §3 (default).
export type OrbColors = { a: string; b: string; c: string; d: string; e: string };
export const OFFBRAND_COLORS: OrbColors = { a: '#f06ba8', b: '#facb0e', c: '#78bae6', d: '#f4a26a', e: '#e8d8c8' };

const hex = (h: string) => new THREE.Color(h);
const FRAG = `precision highp float;
uniform float u_t; uniform vec2 u_mouse; uniform float u_scroll; uniform vec3 u_a, u_b, u_c, u_d, u_e; varying vec2 vUv;
vec2 h(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return -1.0+2.0*fract(sin(p)*43758.5453123); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(dot(h(i),f),dot(h(i+vec2(1,0)),f-vec2(1,0)),u.x), mix(dot(h(i+vec2(0,1)),f-vec2(0,1)),dot(h(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
void main(){
  vec2 uv=vUv-0.5; float t=u_t*0.12+u_scroll*0.0006;
  vec2 dm=uv-u_mouse; float md=length(dm); vec2 push=normalize(dm+1e-4)*0.12*exp(-md*md*12.0);
  vec2 p=uv+push;
  vec2 q=vec2(fbm(p*2.0+t), fbm(p*2.0+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p*2.0+3.0*q+vec2(1.7,9.2)+0.15*t), fbm(p*2.0+3.0*q+vec2(8.3,2.8)+0.126*t));
  float f=fbm(p*2.0+3.0*r);
  vec3 c=mix(u_d, u_e, smoothstep(-0.1,0.5,f));
  c=mix(c, u_a, smoothstep(0.1,0.7,-uv.x*1.4+q.x*0.8));
  c=mix(c, u_b, smoothstep(0.15,0.75,uv.x*1.4+r.x*0.8));
  c=mix(c, u_c, smoothstep(0.55,1.0,-uv.y*1.6+r.y*0.6));
  float d=length(uv*2.0); c*=smoothstep(1.05,0.55,d)*0.35+0.65;
  gl_FragColor=vec4(c,1.0);
}`;
const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

function Quad({ host, colors }: { host: RefObject<HTMLElement | null>; colors: OrbColors }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const pointer = useRef({ x: -9999, y: -9999 });
  const target = useRef(new THREE.Vector2(0.6, 0.6)); // fuera del orb hasta que entre el mouse
  const mouse = useRef(new THREE.Vector2(0.6, 0.6));
  const uniforms = useMemo(() => ({
    u_t: { value: 0 }, u_mouse: { value: mouse.current }, u_scroll: { value: 0 },
    u_a: { value: hex(colors.a) }, u_b: { value: hex(colors.b) }, u_c: { value: hex(colors.c) }, u_d: { value: hex(colors.d) }, u_e: { value: hex(colors.e) },
  }), [colors]);
  useEffect(() => {
    const move = (e: MouseEvent) => { pointer.current.x = e.clientX; pointer.current.y = e.clientY; };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);
  useFrame(({ clock }) => {
    const el = host.current; if (!el || !mat.current) return;
    const r = el.getBoundingClientRect();
    target.current.set((pointer.current.x - r.left) / r.width - 0.5, 0.5 - (pointer.current.y - r.top) / r.height);
    mouse.current.lerp(target.current, 0.08); // lag, como el cursor del original
    uniforms.u_t.value = clock.elapsedTime; uniforms.u_scroll.value = window.scrollY;
  });
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
    </mesh>
  );
}

export default function LiquidOrb({ host, colors = OFFBRAND_COLORS }: { host: RefObject<HTMLElement | null>; colors?: OrbColors }) {
  // ponytail: dpr 1; el original renderiza 1440². Subir dpr si se ve pixelado.
  return (
    <Canvas dpr={1} frameloop={reducedMotion() ? 'demand' : 'always'} gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }} style={{ position: 'absolute', inset: 0 }} aria-hidden>
      <Quad host={host} colors={colors} />
    </Canvas>
  );
}
