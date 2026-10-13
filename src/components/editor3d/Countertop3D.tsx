import {useEffect, useRef, useState} from 'react';
import {BoxGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {solidDimensions, type CountertopModel} from '../../lib/editor3dModel';
type Runtime = {mesh: Mesh<BoxGeometry, MeshStandardMaterial>; render: () => void; fit: (reset: boolean) => void};
export default function Countertop3D({model, fitKey, resetKey}: {model: CountertopModel; fitKey: number; resetKey: number}) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const modelRef = useRef(model); modelRef.current=model;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const host=container.current!;
    let renderer: WebGLRenderer | undefined, controls: OrbitControls | undefined, observer: ResizeObserver | undefined;
    let geometry: BoxGeometry | undefined, material: MeshStandardMaterial | undefined;
    let frame=0, lost=false;
    const scene=new Scene(); scene.background=new Color('#f1f5f9');
    const camera=new PerspectiveCamera(40,1,.01,100);
    const render=()=>{if (!frame && !lost) frame=requestAnimationFrame(()=>{frame=0; try {renderer?.render(scene,camera);} catch {lost=true; setError('Falha ao renderizar 3D. O modelo local continua disponível em 2D.');}});};
    const onLost=(e: Event)=>{e.preventDefault(); lost=true; cancelAnimationFrame(frame); frame=0; setError('Contexto WebGL perdido. O modelo local foi preservado.');};
    try {
      renderer=new WebGLRenderer({antialias:true, powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
      renderer.domElement.setAttribute('aria-label','Vista 3D: arraste para orbitar; botão direito ou dois dedos para mover; roda ou pinça para zoom.');
      renderer.domElement.tabIndex=0;
      host.appendChild(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost',onLost);
      controls=new OrbitControls(camera,renderer.domElement);
      controls.enableDamping=false; controls.minDistance=.05; controls.maxDistance=40;
      controls.listenToKeyEvents(renderer.domElement);
      controls.addEventListener('change',render);
      geometry=new BoxGeometry(...solidDimensions(modelRef.current)); material=new MeshStandardMaterial({color:'#cbb899',roughness:.75,metalness:0});
      const mesh=new Mesh(geometry,material); scene.add(mesh);
      scene.add(new HemisphereLight('#ffffff','#697685',2));
      const light=new DirectionalLight('#ffffff',3); light.position.set(3,5,2); scene.add(light);
      const fit=(reset:boolean)=>{
        const dimensions=solidDimensions(modelRef.current), radius=Math.hypot(...dimensions)/2;
        const angle=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));
        const distance=radius/Math.sin(angle)*1.15;
        const direction=reset?new Vector3(1,.8,1):camera.position.clone().sub(controls!.target);
        if (direction.lengthSq()===0) direction.set(1,.8,1);
        controls!.target.set(0,0,0); camera.position.copy(direction.normalize().multiplyScalar(distance));
        camera.near=Math.max(.001,radius/100); camera.far=Math.max(100,distance*10); camera.updateProjectionMatrix(); controls!.update(); render();
      };
      runtime.current={mesh,render,fit};
      observer=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect(); if(width>0&&height>0){renderer!.setSize(width,height); camera.aspect=width/height; camera.updateProjectionMatrix(); fit(false);}});
      observer.observe(host); fit(true); setError('');
    } catch {setError('WebGL indisponível. Continue no desenho 2D; suas dimensões estão preservadas.');}
    return ()=>{
      lost=true; cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose();
      renderer?.domElement.removeEventListener('webglcontextlost',onLost);
      runtime.current?.mesh.geometry.dispose(); geometry?.dispose(); material?.dispose();
      scene.clear(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); runtime.current=null;
    };
  }, [attempt]);
  useEffect(()=>{const r=runtime.current;if(r){r.mesh.geometry.dispose(); r.mesh.geometry=new BoxGeometry(...solidDimensions(model));r.render();}},[model]);
  useEffect(()=>runtime.current?.fit(false),[fitKey]);
  useEffect(()=>runtime.current?.fit(true),[resetKey]);
  return <section className="relative h-full min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" aria-label="Vista 3D">
    <div ref={container} className="h-full min-h-72 w-full" />
    {error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-sm text-slate-600"><p>{error}</p><button type="button" onClick={()=>setAttempt(a=>a+1)} className="rounded-xl bg-brand-primary px-4 py-2">Tentar inicializar 3D novamente</button></div>}
    {!error && <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-slate-500">Arraste para orbitar · Roda/pinça para zoom · Setas ou dois dedos para mover</p>}
  </section>;
}
