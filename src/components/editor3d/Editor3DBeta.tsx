import {Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {acknowledgeDrawing, DEFAULT_COUNTERTOP, DIMENSION_LIMITS, experimentalArea, hasPendingDrawing, mmToCm, parseCentimeters, serializeCountertop, type CountertopModel, type DimensionKey} from '../../lib/editor3dModel';
import {cachedDrawing, loadDrawing, saveDrawing} from '../../lib/editor3dPersistence';
import Countertop2D from './Countertop2D';
const Countertop3D=lazy(()=>import('./Countertop3D'));
class RenderBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  declare props: {children: ReactNode};
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p role="alert" className="rounded-2xl bg-slate-50 p-6">Não foi possível carregar o 3D. O desenho 2D e suas alterações continuam disponíveis.</p>:this.props.children;}
}
const labels: Record<DimensionKey,string>={lengthMm:'Comprimento',depthMm:'Profundidade',thicknessMm:'Espessura'};
const inputsFor=(model:CountertopModel)=>Object.fromEntries(Object.entries(model.dimensions).map(([key,value])=>[key,String(mmToCm(value)).replace('.',',')])) as Record<DimensionKey,string>;
const button='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-primary disabled:opacity-50';
export default function Editor3DBeta({quoteId,pieceId,pieceName,userId,onClose}:{quoteId?:string;pieceId:string;pieceName:string;userId:string;onClose:()=>void}) {
  const initial=quoteId?cachedDrawing(userId,quoteId,pieceId):undefined;
  const [model,setModel]=useState<CountertopModel>(initial?.model || DEFAULT_COUNTERTOP);
  const [inputs,setInputs]=useState(()=>inputsFor(initial?.model || DEFAULT_COUNTERTOP));
  const [saved,setSaved]=useState(()=>serializeCountertop(initial?.model || DEFAULT_COUNTERTOP));
  const [revision,setRevision]=useState<number|null>(initial?.revision || null);
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[status,setStatus]=useState(''),[conflict,setConflict]=useState(false);
  const [loadKey,setLoadKey]=useState(0),[fitKey,setFitKey]=useState(0),[resetKey,setResetKey]=useState(0);
  const [view,setView]=useState<'2d'|'3d'|'both'>('2d');
  const [confirmation,setConfirmation]=useState<'close'|'reload'|null>(null);
  const confirmationRef=useRef(confirmation); confirmationRef.current=confirmation;
  const dialog=useRef<HTMLDivElement>(null), modelRef=useRef(model); modelRef.current=model;
  const inputsRef=useRef(inputs); inputsRef.current=inputs;
  const pending=hasPendingDrawing(model,saved) || (Object.keys(labels) as DimensionKey[]).some(key=>parseCentimeters(inputs[key],key).error);
  const stateRef=useRef({pending,saving}); stateRef.current={pending:!!pending,saving};
  const close=useCallback(()=>{
    if(stateRef.current.saving)return;
    if(stateRef.current.pending){setConfirmation('close');return;}
    onClose();
  },[onClose]);
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
    dialog.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(confirmationRef.current)setConfirmation(null);else closeRef.current();}
      if(event.key==='Tab'){
        const scope=dialog.current?.querySelector('[data-editor3d-confirm]') || dialog.current;
        const elements=[...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || [])].filter(el=>el.getClientRects().length>0);
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey && (document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    const unload=(event:BeforeUnloadEvent)=>{if(stateRef.current.pending||stateRef.current.saving){event.preventDefault();event.returnValue='';}};
    window.addEventListener('keydown',keydown,true);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('keydown',keydown,true);window.removeEventListener('beforeunload',unload);document.body.style.overflow=previousOverflow;previous?.focus();};
  },[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setReady(false);setError('');setStatus('');setConflict(false);
    if(!quoteId || !/^[A-Za-z0-9_-]{1,100}$/.test(pieceId)){
      setLoading(false);setError('Salve o orçamento e a peça com ID estável pelos fluxos existentes antes de vincular o desenho Beta.');
      return;
    }
    loadDrawing(userId,quoteId,pieceId).then(record=>{
      if(!active)return;
      const next=record?.model || DEFAULT_COUNTERTOP;
      setModel(next);setInputs(inputsFor(next));setSaved(serializeCountertop(next));setRevision(record?.revision || null);setReady(true);
    }).catch(err=>{if(active)setError(err.message || 'Erro ao carregar desenho.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[quoteId,pieceId,userId,loadKey]);
  const reload=()=>{
    if(pending){setConfirmation('reload');return;}
    setLoadKey(k=>k+1);
  };
  const save=async()=>{
    if(!ready||!quoteId||loading||saving)return;
    if((Object.keys(labels) as DimensionKey[]).some(key=>parseCentimeters(inputsRef.current[key],key).error))return;
    const submitted=JSON.parse(serializeCountertop(modelRef.current)) as CountertopModel;
    setSaving(true);setError('');setStatus('');setConflict(false);
    try {
      const record=await saveDrawing(userId,quoteId,pieceId,submitted,revision);
      setRevision(record.revision);setSaved(acknowledgeDrawing(submitted,modelRef.current).saved);
      setStatus(`Desenho salvo · revisão ${record.revision}.`);
    } catch(err:any){setError(err.message || 'Falha ao salvar. Suas alterações locais foram preservadas.');setConflict(err.code==='40001');}
    finally{setSaving(false);}
  };
  const valid=(Object.keys(labels) as DimensionKey[]).every(key=>!parseCentimeters(inputs[key],key).error);
  return createPortal(<div className="fixed inset-0 z-[150] bg-slate-950/50 p-2 sm:p-5">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="editor3d-title" tabIndex={-1} className="relative mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-[#FBFBFD] shadow-2xl outline-none">
      {confirmation && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4"><div data-editor3d-confirm role="alertdialog" aria-modal="true" aria-labelledby="editor3d-confirm-title" className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 id="editor3d-confirm-title" className="font-semibold">Descartar alterações locais?</h3><p className="my-4 text-sm text-slate-600">{confirmation==='close'?'Há alterações não salvas no desenho Beta. Descartar e fechar?':'Recarregar o desenho salvo e descartar as alterações locais?'}</p>
        <div className="flex gap-2"><button type="button" autoFocus onClick={()=>setConfirmation(null)} className={button}>Continuar editando</button><button type="button" onClick={()=>{setConfirmation(null);if(confirmation==='close')onClose();else setLoadKey(k=>k+1);}} className={button}>{confirmation==='close'?'Descartar e fechar':'Descartar e recarregar'}</button></div>
      </div></div>}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
        <div><h2 id="editor3d-title" className="font-display text-xl font-semibold text-slate-900">Editor 2D/3D <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-normal text-amber-800">Beta 0.1</span></h2><p className="text-sm text-slate-500">{pieceName || 'Peça'} · Bancada retangular experimental</p></div>
        <div className="flex gap-2"><button type="button" disabled={!ready||!valid||saving||loading} onClick={()=>void save()} className={`${button} bg-brand-primary`}>{saving?'Salvando…':'Salvar desenho'}</button><button type="button" disabled={saving} onClick={close} className={button}>Fechar</button></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div aria-live="polite" className="mb-3 text-sm text-slate-600">{loading?'Carregando desenho…':pending?'Alterações pendentes':revision?`Salvo · revisão ${revision}`:'Novo desenho'}{status && <span className="ml-3 text-emerald-700">{status}</span>}</div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p>{error}</p>{quoteId && <button type="button" disabled={saving||loading} onClick={reload} className={`${button} mt-2`}>{conflict?'Recarregar versão salva (descarta alterações locais)':'Tentar carregar novamente'}</button>}</div>}
        <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-4 font-semibold text-slate-900">Propriedades</h3>
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              {(Object.keys(labels) as DimensionKey[]).map(key=>{
                const result=parseCentimeters(inputs[key],key),[min,max]=DIMENSION_LIMITS[key];
                return <label key={key} className="text-sm text-slate-600">{labels[key]} (cm)<input type="text" inputMode="decimal" maxLength={12} disabled={loading} value={inputs[key]} aria-invalid={!!result.error} aria-describedby={`editor3d-${key}`} onChange={e=>{
                  const text=e.target.value;setInputs(current=>({...current,[key]:text}));setStatus('');
                  const parsed=parseCentimeters(text,key);if(parsed.mm!==undefined)setModel(current=>({...current,dimensions:{...current.dimensions,[key]:parsed.mm!}}));
                }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-primary"/><span id={`editor3d-${key}`} className={`mt-1 block text-xs ${result.error?'text-rose-700':'text-slate-400'}`}>{result.error || `${mmToCm(min)}–${mmToCm(max)} cm · precisão 0,1 cm`}</span></label>;
              })}
            </div>
            <p className="mt-5 text-sm text-slate-700">{mmToCm(model.dimensions.lengthMm).toLocaleString('pt-BR')} × {mmToCm(model.dimensions.depthMm).toLocaleString('pt-BR')} cm = {experimentalArea(model).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})} m²</p>
            <p className="mt-2 text-xs text-slate-500">Área experimental informativa. Medidas, desenho e preços oficiais permanecem independentes.</p>
          </aside>
          <div className="min-w-0">
            <nav className="mb-3 flex flex-wrap gap-2" aria-label="Visualizações e câmera">
              {(['2d','3d','both'] as const).map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>setView(v)} className={`${button} ${view===v?'border-amber-400 bg-amber-50':''} ${v==='both'?'hidden lg:block':''}`}>{v==='both'?'2D e 3D':v.toUpperCase()}</button>)}
              <button type="button" onClick={()=>setFitKey(k=>k+1)} className={button}>Ajustar visualização</button>
              <button type="button" onClick={()=>{setResetKey(k=>k+1);setFitKey(k=>k+1);}} className={button}>Restaurar câmera</button>
            </nav>
            <div className={`grid h-[430px] gap-4 sm:h-[500px] ${view==='both'?'lg:grid-cols-2':''}`}>
              {(view==='2d'||view==='both') && <Countertop2D model={model} resetKey={fitKey} />}
              {(view==='3d'||view==='both') && <RenderBoundary><Suspense fallback={<p role="status" className="p-6">Carregando renderizador 3D…</p>}><Countertop3D model={model} fitKey={fitKey} resetKey={resetKey}/></Suspense></RenderBoundary>}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>,document.body);
}
