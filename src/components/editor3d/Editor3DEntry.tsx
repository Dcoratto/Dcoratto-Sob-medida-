import {Component, lazy, Suspense, type ReactNode} from 'react';
const Editor=lazy(()=>import('./Editor3DBeta'));
class ModuleBoundary extends Component<{children:ReactNode;onClose:()=>void},{failed:boolean}> {
  declare props: {children:ReactNode;onClose:()=>void};
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div role="dialog" aria-modal="true" aria-label="Falha ao abrir Editor 3D Beta" className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-6"><div className="rounded-2xl bg-white p-6"><p role="alert">Não foi possível abrir o Beta. O orçamento foi preservado.</p><button type="button" autoFocus onClick={this.props.onClose} className="mt-4 rounded-xl bg-brand-primary px-4 py-2">Fechar</button></div></div>:this.props.children;}
}
export default function Editor3DEntry(props:{quoteId?:string;pieceId:string;pieceName:string;userId:string;onClose:()=>void}) {
  return <ModuleBoundary onClose={props.onClose}><Suspense fallback={<div role="dialog" aria-modal="true" aria-label="Carregando Editor 3D Beta" className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-6"><div className="rounded-2xl bg-white p-6"><p role="status">Carregando Editor 3D Beta…</p><button type="button" onClick={props.onClose} className="mt-4 rounded-xl border px-4 py-2">Fechar</button></div></div>}><Editor {...props}/></Suspense></ModuleBoundary>;
}
