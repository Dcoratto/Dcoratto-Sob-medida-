import {useEffect, useId, useRef, useState} from 'react';
import {mmToCm, topOutline, type CountertopModel} from '../../lib/editor3dModel';
export default function Countertop2D({model, resetKey}: {model: CountertopModel; resetKey: number}) {
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, {x: number; y: number}>());
  const [size, setSize] = useState({width: 640, height: 420});
  const [view, setView] = useState({zoom: 1, x: 0, y: 0});
  const gridId = useId().replace(/:/g, '');
  useEffect(() => {setView({zoom: 1, x: 0, y: 0}); pointers.current.clear();}, [resetKey]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height)}));
    if (svg.current) observer.observe(svg.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element=svg.current;
    const wheel=(event:WheelEvent)=>{event.preventDefault();setView(v=>({...v,zoom:Math.max(.25,Math.min(5,v.zoom*(event.deltaY<0?1.1:1/1.1)))}));};
    element?.addEventListener('wheel',wheel,{passive:false});
    return()=>element?.removeEventListener('wheel',wheel);
  },[]);
  const {width, height} = topOutline(model);
  const scale = Math.max(.001, Math.min((size.width - 120) / width, (size.height - 120) / height)) * view.zoom;
  const left = size.width / 2 + view.x - width * scale / 2;
  const top = size.height / 2 + view.y - height * scale / 2;
  const zoom = (factor: number) => setView(v => ({...v, zoom: Math.max(.25, Math.min(5, v.zoom * factor))}));
  return <section className="relative h-full min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" aria-label="Vista superior 2D, plano X/Z">
    <div className="absolute left-3 top-3 z-10 flex gap-2">
      <button type="button" onClick={() => zoom(1.2)} aria-label="Aproximar 2D" className="rounded-xl border bg-white px-3 py-2">+</button>
      <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Afastar 2D" className="rounded-xl border bg-white px-3 py-2">−</button>
    </div>
    <svg ref={svg} className="h-full min-h-72 w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" viewBox={`0 0 ${size.width} ${size.height}`} tabIndex={0} role="img" aria-label={`Bancada ${mmToCm(width)} por ${mmToCm(height)} centímetros. Use setas para mover e mais ou menos para zoom.`}
      onKeyDown={e => {
        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key)) e.preventDefault();
        if (e.key === '+' || e.key === '=') zoom(1.2);
        if (e.key === '-') zoom(1 / 1.2);
        if (e.key === 'Home') setView({zoom:1,x:0,y:0});
        if (e.key.startsWith('Arrow')) setView(v => ({...v, x:v.x+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0), y:v.y+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0)}));
      }}
      onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});}}
      onPointerUp={e => pointers.current.delete(e.pointerId)} onPointerCancel={e => pointers.current.delete(e.pointerId)}
      onLostPointerCapture={e => pointers.current.delete(e.pointerId)}
      onPointerMove={e => {
        const old = pointers.current.get(e.pointerId); if (!old) return;
        const other = [...pointers.current.entries()].find(([id])=>id!==e.pointerId)?.[1];
        if (other) {
          const before=Math.hypot(old.x-other.x,old.y-other.y), after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
          if (before>0) zoom(after/before);
          setView(v=>({...v,x:v.x+(e.clientX-old.x)/2,y:v.y+(e.clientY-old.y)/2}));
        } else setView(v=>({...v,x:v.x+e.clientX-old.x,y:v.y+e.clientY-old.y}));
        pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
      }}>
      <defs><pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" /></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${gridId})`} />
      <rect x={left} y={top} width={width*scale} height={height*scale} fill="#ead9b9" stroke="#806341" strokeWidth="2" />
      <path d={`M${left},${top-16} h${width*scale} M${left},${top-21} v10 M${left+width*scale},${top-21} v10 M${left+width*scale+16},${top} v${height*scale} M${left+width*scale+11},${top} h10 M${left+width*scale+11},${top+height*scale} h10`} fill="none" stroke="#475569" />
      <text x={left+width*scale/2} y={Math.max(80,top-26)} textAnchor="middle" fill="#334155" fontSize="14">{mmToCm(width).toLocaleString('pt-BR')} cm</text>
      <text x={Math.min(size.width-44,left+width*scale+36)} y={top+height*scale/2} textAnchor="middle" fill="#334155" fontSize="14" transform={`rotate(-90 ${Math.min(size.width-44,left+width*scale+36)} ${top+height*scale/2})`}>{mmToCm(height).toLocaleString('pt-BR')} cm</text>
    </svg>
    <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-slate-500">Selecionar/navegar · Arraste, role ou use dois dedos</p>
  </section>;
}
