import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { 
  MousePointer2, Pencil, Trash2, RotateCcw, RotateCw, 
  ZoomIn, ZoomOut, Maximize, Grid3X3, Square, 
  Box, CornerUpRight, Layout, Minimize2, Check,
  X, Type, Ruler, Scissors, Move, Plus, Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { PieceSide, DrawingCutout } from '../types';

interface Point {
  x: number;
  y: number;
}

interface Side {
  id: string;
  label: string;
  length: number;
  p1: Point;
  p2: Point;
}

interface DrawingCanvasProps {
  onSave?: (data: {
    json: string, 
    area: number, 
    previewUrl: string, 
    sides: PieceSide[],
    largestSide: number,
    cutouts: DrawingCutout[]
  }) => void;
  onCancel?: () => void;
  initialJson?: string;
  initialSides?: PieceSide[];
  initialCutouts?: DrawingCutout[];
  className?: string;
  settings?: any; // For heights
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ 
  onSave, 
  onCancel,
  initialJson, 
  initialSides = [],
  initialCutouts = [],
  className,
  settings 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Viewport State
  const [zoom, setZoom] = useState(100); // 100 means 1px = 1mm approx (or arbitrary scale)
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  
  // Drawing State
  const [points, setPoints] = useState<Point[]>([]);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [closed, setClosed] = useState(false);
  const [ortho, setOrtho] = useState(true);
  const [snap, setSnap] = useState(true);
  const [tool, setTool] = useState<'line' | 'select' | 'cutout' | 'move'>('line');
  
  // Measurement Input
  const [measureValue, setMeasureValue] = useState('');
  
  // Extras/Sides state
  const [sides, setSides] = useState<PieceSide[]>([]);
  const [cutouts, setCutouts] = useState<DrawingCutout[]>(initialCutouts);
  
  // History
  const [history, setHistory] = useState<{points: Point[], closed: boolean}[]>([]);
  const [redoStack, setRedoStack] = useState<{points: Point[], closed: boolean}[]>([]);

  // Initialize
  useEffect(() => {
    if (initialJson) {
      try {
        const data = JSON.parse(initialJson);
        if (data.points) setPoints(data.points);
        if (data.closed) setClosed(data.closed);
        if (data.cutouts) setCutouts(data.cutouts);
      } catch (e) {
        console.error("Failed to parse initial drawing", e);
      }
    }
  }, [initialJson]);

  // Coordinate Conversion
  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / (zoom / 100),
      y: (clientY - rect.top - offset.y) / (zoom / 100)
    };
  }, [offset, zoom]);

  const worldToScreen = useCallback((point: Point): Point => {
    return {
      x: point.x * (zoom / 100) + offset.x,
      y: point.y * (zoom / 100) + offset.y
    };
  }, [offset, zoom]);

  // side naming utility
  const getSideLabel = (index: number) => {
    let label = '';
    let i = index;
    while (i >= 0) {
      label = String.fromCharCode((i % 26) + 65) + label;
      i = Math.floor(i / 26) - 1;
    }
    return `Lado ${label}`;
  };

  // derived sides and labels
  const derivedSides = useMemo(() => {
    if (points.length < 2) return [];
    const s: Side[] = [];
    const count = closed ? points.length : points.length - 1;
    
    for (let i = 0; i < count; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      s.push({
        id: `side-${i}`,
        label: getSideLabel(i),
        length: length / 10, // Assuming world units are mm, length in cm
        p1, 
        p2
      });
    }
    return s;
  }, [points, closed]);

  // sync PieceSide objects
  useEffect(() => {
    const newPieceSides: PieceSide[] = derivedSides.map((ds, idx) => {
      const existing = initialSides.find(s => s.side === ds.label);
      return {
        type: existing?.type || 'none',
        side: ds.label,
        sideLabel: ds.label,
        length: ds.length, // stored in cm
        height: existing?.height || 0,
        quantity: existing?.quantity || 1,
        area: 0
      };
    });
    setSides(newPieceSides);
  }, [derivedSides]);

  // Area calculation (m2)
  const calculateArea = useCallback((pts: Point[]) => {
    if (pts.length < 3) return 0;
    let total = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      total += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    }
    // Result is in mm2 if coords are mm. Convert to m2 (1m2 = 1,000,000 mm2)
    return Math.abs(total / 2) / 1000000;
  }, []);

  const currentArea = useMemo(() => calculateArea(points), [calculateArea, points]);

  // Drawing functions
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to container
    const container = containerRef.current;
    if (container && (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight)) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const scale = zoom / 100;
    
    // Draw Grid
    ctx.save();
    const gridSpacing = 50 * scale; // 50mm grid
    const startX = offset.x % gridSpacing;
    const startY = offset.y % gridSpacing;

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;

    // Small grid
    for (let x = startX; x < canvas.width; x += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = startY; y < canvas.height; y += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Major grid
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2;
    const majorGridSpacing = gridSpacing * 5;
    const mStartX = offset.x % majorGridSpacing;
    const mStartY = offset.y % majorGridSpacing;
    for (let x = mStartX; x < canvas.width; x += majorGridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = mStartY; y < canvas.height; y += majorGridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw Piece
    if (points.length > 0) {
      // Shape fill
      if (closed && points.length > 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(140, 106, 72, 0.08)';
        ctx.fill();
      }

      // Lines
      ctx.beginPath();
      ctx.strokeStyle = '#8C6A48';
      ctx.lineWidth = 2 / scale;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      if (closed) ctx.closePath();
      ctx.stroke();

      // Preview line
      if (previewPoint && !closed && tool === 'line') {
        ctx.beginPath();
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.strokeStyle = 'rgba(140, 106, 72, 0.5)';
        const last = points[points.length - 1];
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(previewPoint.x, previewPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Live Measurement Label
        const dist = Math.hypot(previewPoint.x - last.x, previewPoint.y - last.y) / 10;
        const midX = (last.x + previewPoint.x) / 2;
        const midY = (last.y + previewPoint.y) / 2;
        
        ctx.save();
        ctx.translate(midX, midY);
        ctx.fillStyle = '#8C6A48';
        ctx.font = `bold ${12/scale}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText(`${dist.toFixed(1)} cm`, 0, -10/scale);
        ctx.restore();
      }

      // Cutouts
      cutouts.forEach(c => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.setLineDash([2/scale, 2/scale]);
        ctx.fillRect(c.x - c.width/2, c.y - c.height/2, c.width, c.height);
        ctx.strokeRect(c.x - c.width/2, c.y - c.height/2, c.width, c.height);
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#64748b';
        ctx.font = `${10/scale}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText(c.type.toUpperCase(), c.x, c.y + 4/scale);
      });

      // Vertices
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.fillStyle = closed ? '#8C6A48' : (i === points.length - 1 ? '#ef4444' : '#8C6A48');
        ctx.arc(p.x, p.y, 4 / scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      });

      // Dimension Labels
      derivedSides.forEach((ds) => {
        const midX = (ds.p1.x + ds.p2.x) / 2;
        const midY = (ds.p1.y + ds.p2.y) / 2;
        
        // Calculate normal vector (to push labels out)
        const dx = ds.p2.x - ds.p1.x;
        const dy = ds.p2.y - ds.p1.y;
        const angle = Math.atan2(dy, dx);
        
        // Push label away from shape center if closed
        let normalAngle = angle - Math.PI / 2;
        // Simple logic for pushing out: if we are drawing clockwise, normal points out
        // For better logic, one should check if (mid + normal) is inside the polygon
        
        ctx.save();
        ctx.translate(midX, midY);
        
        // Rotate text to follow line
        let textRotation = angle;
        if (textRotation > Math.PI / 2 || textRotation < -Math.PI / 2) {
          textRotation += Math.PI;
        }
        ctx.rotate(textRotation);
        
        // Background tag
        const text = `${ds.label}: ${ds.length.toFixed(1)} cm`;
        ctx.font = `bold ${Math.max(9, 13 / scale)}px Inter`;
        const metrics = ctx.measureText(text);
        const padding = 4 / scale;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(-metrics.width/2 - padding, -10/scale - padding - 8/scale, metrics.width + padding*2, 16/scale + padding*2);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(-metrics.width/2 - padding, -10/scale - padding - 8/scale, metrics.width + padding*2, 16/scale + padding*2);
        
        ctx.fillStyle = '#1e293b';
        ctx.textAlign = 'center';
        ctx.fillText(text, 0, -10/scale);
        
        ctx.restore();
      });
    }

    ctx.restore();
  }, [points, previewPoint, closed, tool, zoom, offset, derivedSides, cutouts]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Step 1: Canvas Events for Zoom and Pan
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Relative mouse position in world coordinates before zoom
    const worldX = (mouseX - offset.x) / (zoom / 100);
    const worldY = (mouseY - offset.y) / (zoom / 100);

    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 200);
    const newZoom = Math.max(5, Math.min(2000, zoom * factor));
    
    // New offset to keep mouse position fixed
    const newOffsetX = mouseX - worldX * (newZoom / 100);
    const newOffsetY = mouseY - worldY * (newZoom / 100);

    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [offset, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => canvas?.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Handlers
  const [cutoutType, setCutoutType] = useState<'cuba' | 'cooktop' | 'torneira'>('cuba');

  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent middle click from doing anything else (like auto-scroll)
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      return;
    }
    
    if (tool === 'move') {
      setIsPanning(true);
      return;
    }

    const pos = screenToWorld(e.clientX, e.clientY);

    if (e.button === 0) {
      if (tool === 'cutout') {
        const newCutout: DrawingCutout = {
          id: Math.random().toString(36).substr(2, 9),
          type: cutoutType,
          x: pos.x,
          y: pos.y,
          width: cutoutType === 'cooktop' ? 600 : (cutoutType === 'cuba' ? 500 : 50),
          height: cutoutType === 'cooktop' ? 500 : (cutoutType === 'cuba' ? 400 : 50)
        };
        setCutouts([...cutouts, newCutout]);
        setTool('select');
        return;
      }

      let target = pos;
      if (closed) return; 

      if (points.length > 0) {
        const last = points[points.length - 1];
        if (ortho) {
          const dx = Math.abs(pos.x - last.x);
          const dy = Math.abs(pos.y - last.y);
          if (dx > dy) target = { x: pos.x, y: last.y };
          else target = { x: last.x, y: pos.y };
        }

        // Snap to start
        if (snap && points.length > 2) {
          const distToStart = Math.hypot(pos.x - points[0].x, pos.y - points[0].y);
          if (distToStart < 20 / (zoom / 100)) {
            setHistory([...history, { points, closed }]);
            setRedoStack([]);
            setClosed(true);
            return;
          }
        }
      }

      setHistory([...history, { points, closed }]);
      setRedoStack([]);
      setPoints([...points, target]);
      
      // Auto-focus measurement input after clicking
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: offset.x + e.movementX,
        y: offset.y + e.movementY
      });
      return;
    }

    const pos = screenToWorld(e.clientX, e.clientY);
    let preview = pos;

    if (points.length > 0 && !closed) {
      const last = points[points.length - 1];
      if (ortho) {
        const dx = Math.abs(pos.x - last.x);
        const dy = Math.abs(pos.y - last.y);
        if (dx > dy) preview = { x: pos.x, y: last.y };
        else preview = { x: last.x, y: pos.y };
      }
      
      // Snap to start visualization
      if (snap && points.length > 2) {
        const distToStart = Math.hypot(pos.x - points[0].x, pos.y - points[0].y);
        if (distToStart < 20 / (zoom / 100)) {
          preview = points[0];
        }
      }
    }
    setPreviewPoint(preview);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const undo = useCallback(() => {
    if (history.length > 0) {
      const last = history[history.length - 1];
      setRedoStack([...redoStack, { points, closed }]);
      setPoints(last.points);
      setClosed(last.closed);
      setHistory(history.slice(0, -1));
    }
  }, [history, redoStack, points, closed]);

  const redo = useCallback(() => {
    if (redoStack.length > 0) {
      const last = redoStack[redoStack.length - 1];
      setHistory([...history, { points, closed }]);
      setPoints(last.points);
      setClosed(last.closed);
      setRedoStack(redoStack.slice(0, -1));
    }
  }, [history, redoStack, points, closed]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
    if (e.key === 'Escape') {
      setTool('select');
      setPreviewPoint(null);
    }
    if (e.key === 'Enter' && measureValue) {
      e.preventDefault();
      // Precise measure logic
      if (points.length > 0 && previewPoint) {
        const last = points[points.length - 1];
        const val = parseFloat(measureValue.replace(',', '.'));
        if (!isNaN(val)) {
          const mm = val * 10; // Input in cm, world in mm
          const dx = previewPoint.x - last.x;
          const dy = previewPoint.y - last.y;
          const dist = Math.hypot(dx, dy);
          const ux = dx / dist;
          const uy = dy / dist;
          const newPt = { x: last.x + ux * mm, y: last.y + uy * mm };
          
          setHistory([...history, { points, closed }]);
          setRedoStack([]);
          setPoints([...points, newPt]);
          setMeasureValue('');
          
          // Re-focus for next point
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 50);
        }
      }
    }
  }, [history, redoStack, points, closed, measureValue, previewPoint, undo, redo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const clear = () => {
    if (confirm('Tem certeza que deseja limpar todo o desenho?')) {
      setHistory([]);
      setRedoStack([]);
      setPoints([]);
      setClosed(false);
      setCutouts([]);
    }
  };

  const centerDrawing = () => {
    if (points.length === 0) {
      setOffset({ x: 0, y: 0 });
      setZoom(100);
      return;
    }
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      setOffset({
        x: cw / 2 - centerX * (zoom / 100),
        y: ch / 2 - centerY * (zoom / 100)
      });
    }
  };

  const closeGeometry = () => {
    if (points.length < 3) return;
    setHistory([...history, { points, closed }]);
    setClosed(true);
  };

  const applyModel = (model: 'rect' | 'L' | 'island') => {
    setHistory([...history, { points, closed }]);
    let newPts: Point[] = [];
    if (model === 'rect') {
      newPts = [{x:0,y:0}, {x:1200,y:0}, {x:1200,y:600}, {x:0,y:600}];
    } else if (model === 'L') {
      newPts = [{x:0,y:0}, {x:1500,y:0}, {x:1500,y:600}, {x:600,y:600}, {x:600,y:1500}, {x:0,y:1500}];
    } else if (model === 'island') {
      newPts = [{x:0,y:0}, {x:2000,y:0}, {x:2000,y:900}, {x:0,y:900}];
    }
    setPoints(newPts);
    setClosed(true);
    setOffset({ x: 100, y: 100 });
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    // Create a normalized preview by drawing on a temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 400;
    tempCanvas.height = 400;
    const tctx = tempCanvas.getContext('2d');
    
    if (tctx) {
      // Find bounds
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      
      const pWidth = maxX - minX;
      const pHeight = maxY - minY;
      const pCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      
      // Calculate scale to fit in 360x360 (with padding)
      const scale = Math.min(360 / pWidth, 360 / pHeight);
      
      tctx.fillStyle = '#f8fafc';
      tctx.fillRect(0, 0, 400, 400);
      
      tctx.translate(200, 200);
      tctx.scale(scale, scale);
      tctx.translate(-pCenter.x, -pCenter.y);
      
      // Draw shape
      tctx.beginPath();
      tctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) tctx.lineTo(points[i].x, points[i].y);
      if (closed) tctx.closePath();
      
      tctx.strokeStyle = '#8C6A48';
      tctx.lineWidth = 4 / scale;
      tctx.lineJoin = 'round';
      tctx.stroke();
      
      if (closed) {
        tctx.fillStyle = 'rgba(140, 106, 72, 0.1)';
        tctx.fill();
      }

      // Draw cutouts
      cutouts.forEach(c => {
        tctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        tctx.fillRect(c.x - c.width/2, c.y - c.height/2, c.width, c.height);
      });
    }

    const json = JSON.stringify({ points, closed, cutouts });
    const previewUrl = tempCanvas.toDataURL('image/png');
    
    const largestSide = Math.max(...derivedSides.map(s => s.length), 0);
    
    onSave?.({
      json,
      area: currentArea,
      previewUrl,
      sides,
      largestSide,
      cutouts
    });
  };

  return (
    <div ref={containerRef} className={cn("relative bg-white border border-slate-200 rounded-[32px] overflow-hidden flex flex-col h-full", className)}>
      {/* Top Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-start justify-between pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <div className="bg-white/90 backdrop-blur shadow-xl border border-slate-100 p-1.5 rounded-2xl flex flex-col gap-1">
            <ToolButton icon={MousePointer2} active={tool === 'select'} onClick={() => setTool('select')} title="Selecionar (Esc)" />
            <ToolButton icon={Pencil} active={tool === 'line'} onClick={() => setTool('line')} title="Desenhar Linha" />
            <ToolButton icon={Move} active={tool === 'move'} onClick={() => setTool('move')} title="Mover / Pan (Botão Meio)" />
            <ToolButton icon={Scissors} active={tool === 'cutout'} onClick={() => setTool('cutout')} title="Adicionar Recorte" />
            {tool === 'cutout' && (
              <div className="absolute left-14 top-24 bg-white/90 backdrop-blur shadow-xl border border-slate-100 p-1.5 rounded-2xl flex flex-col gap-1 animate-in slide-in-from-left-2 transition-all">
                <button 
                  onClick={() => setCutoutType('cuba')}
                  className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all", cutoutType === 'cuba' ? "bg-brand-primary text-white" : "text-slate-400 hover:bg-slate-50")}
                >
                  Cuba
                </button>
                <button 
                  onClick={() => setCutoutType('cooktop')}
                  className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all", cutoutType === 'cooktop' ? "bg-brand-primary text-white" : "text-slate-400 hover:bg-slate-50")}
                >
                  Cooktop
                </button>
                <button 
                  onClick={() => setCutoutType('torneira')}
                  className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all", cutoutType === 'torneira' ? "bg-brand-primary text-white" : "text-slate-400 hover:bg-slate-50")}
                >
                  Torneira
                </button>
              </div>
            )}
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <ToolButton icon={RotateCcw} onClick={undo} title="Desfazer (Ctrl+Z)" disabled={history.length === 0} />
            <ToolButton icon={RotateCw} onClick={redo} title="Refazer (Ctrl+Y)" disabled={redoStack.length === 0} />
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <ToolButton icon={Trash2} onClick={clear} className="text-red-500 hover:bg-red-50" title="Limpar tudo" />
          </div>

          <div className="bg-white/90 backdrop-blur shadow-xl border border-slate-100 p-1.5 rounded-2xl flex flex-col gap-1">
            <ToolButton icon={ZoomIn} onClick={() => setZoom(z => z + 10)} title="Aumentar Zoom" />
            <ToolButton icon={ZoomOut} onClick={() => setZoom(z => Math.max(10, z - 10))} title="Diminuir Zoom" />
            <ToolButton icon={Maximize} onClick={centerDrawing} title="Centralizar Desenho" />
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={() => setOrtho(!ortho)}
              className={cn(
                "bg-white/90 backdrop-blur shadow-xl border border-slate-100 px-4 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all",
                ortho ? "text-brand-primary border-brand-primary/20" : "text-slate-400"
              )}
            >
              <Minimize2 className={cn("w-3 h-3", ortho ? "rotate-45" : "")} />
              ORTHO {ortho ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={() => setSnap(!snap)}
              className={cn(
                "bg-white/90 backdrop-blur shadow-xl border border-slate-100 px-4 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all",
                snap ? "text-brand-primary border-brand-primary/20" : "text-slate-400"
              )}
            >
              <Layout className="w-3 h-3" />
              SNAP {snap ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-100 px-6 py-4 rounded-[24px] min-w-[200px]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Área da Peça</span>
              <Info className="w-3 h-3 text-slate-300" />
            </div>
            <div className="text-2xl font-display font-bold text-brand-primary leading-none">
              {currentArea.toFixed(4)} <span className="text-sm font-sans font-medium text-slate-400">m²</span>
            </div>
            {points.length > 0 && !closed && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <button 
                  onClick={closeGeometry}
                  className="w-full bg-slate-900 text-white text-[10px] uppercase font-bold tracking-widest py-2 rounded-xl hover:bg-brand-primary transition-colors"
                >
                  Fechar Geometria
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <ModelChip label="Bancada Reta" onClick={() => applyModel('rect')} />
            <ModelChip label="Bancada em L" onClick={() => applyModel('L')} />
            <ModelChip label="Ilha" onClick={() => applyModel('island')} />
          </div>
        </div>

        {/* Legend / Instructions */}
        <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
          <div className="bg-white/90 backdrop-blur shadow-xl border border-slate-100 p-4 rounded-2xl flex flex-col gap-2 pointer-events-auto max-w-[200px]">
            <h5 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2 mb-1 flex items-center gap-2">
              <Info className="w-3 h-3 text-brand-primary" /> Como Usar
            </h5>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[9px] font-medium text-slate-500">
                <div className="w-4 h-4 bg-slate-100 rounded flex items-center justify-center font-bold text-slate-400">?</div>
                <span>Scroll: Zoom</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] font-medium text-slate-500">
                <div className="w-4 h-4 bg-slate-100 rounded flex items-center justify-center font-bold text-slate-400">M</div>
                <span>Botão Meio: Pan</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] font-medium text-slate-500">
                <div className="w-4 h-4 bg-slate-100 rounded flex items-center justify-center font-bold text-slate-400">↵</div>
                <span>Enter: Confirmar medida</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] font-medium text-slate-500">
                <div className="w-4 h-4 bg-slate-100 rounded flex items-center justify-center font-bold text-slate-400">Esc</div>
                <span>Parar desenho</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 cursor-crosshair bg-slate-50"
        />

        {/* Floating Input for Measurement */}
        {tool === 'line' && points.length > 0 && !closed && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
            <div className="bg-white shadow-2xl border border-brand-primary/20 rounded-2xl p-2 flex items-center gap-3">
              <div className="bg-brand-primary/10 text-brand-primary p-2 rounded-xl">
                <Ruler className="w-5 h-5" />
              </div>
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={measureValue}
                onChange={(e) => setMeasureValue(e.target.value)}
                placeholder="Digite a medida (ex: 120,5)"
                className="w-48 bg-transparent outline-none font-bold text-lg text-slate-900 placeholder:text-slate-300"
              />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pr-2">cm</div>
              <button 
                onClick={() => handleKeyDown({ key: 'Enter', preventDefault: () => {} } as any)}
                className="bg-brand-primary text-white p-2.5 rounded-xl hover:scale-105 transition-transform"
              >
                <Check className="w-5 h-5" strokeWidth={3} />
              </button>
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white/80 px-3 py-1 rounded-full backdrop-blur">
              Pressione ENTER para confirmar
            </div>
          </div>
        )}
      </div>

      {/* Bottom Side List and Controls */}
      <div className="bg-white border-t border-slate-100 flex flex-col md:flex-row h-72">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between sticky top-0 bg-white pb-2 z-10">
            <h4 className="font-display font-bold text-slate-900 flex items-center gap-2">
              <Layout className="w-4 h-4 text-brand-primary" /> Segmentos e Acabamentos
            </h4>
            <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-2.5 py-1 rounded-full">
              {derivedSides.length} Lado(s) identificado(s)
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {sides.map((side, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center">
                      {side.side.replace('Lado ', '')}
                    </div>
                    <span className="font-bold text-slate-800 text-sm tracking-tight">{side.side}</span>
                  </div>
                  <div className="text-sm font-mono text-slate-500 font-bold">
                    {side.length.toFixed(1)} cm
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <SideActionButton 
                    label="Frontão" 
                    active={side.type === 'frontao'} 
                    onClick={() => {
                      const newSides = [...sides];
                      newSides[idx].type = side.type === 'frontao' ? 'none' : 'frontao';
                      newSides[idx].height = settings?.defaultFrontonHeight || 10;
                      setSides(newSides);
                    }} 
                  />
                  <SideActionButton 
                    label="Saia" 
                    active={side.type === 'saia'} 
                    onClick={() => {
                      const newSides = [...sides];
                      newSides[idx].type = side.type === 'saia' ? 'none' : 'saia';
                      newSides[idx].height = settings?.defaultSkirtHeight || 4;
                      setSides(newSides);
                    }} 
                  />
                  <SideActionButton 
                    label="Virada" 
                    active={side.type === 'virada'} 
                    onClick={() => {
                      const newSides = [...sides];
                      newSides[idx].type = side.type === 'virada' ? 'none' : 'virada';
                      newSides[idx].height = settings?.defaultTurnHeight || 2;
                      setSides(newSides);
                    }} 
                  />
                </div>
                
                {side.type !== 'none' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/50 mt-1 animate-in slide-in-from-top-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Altura (cm):</span>
                    <input 
                      type="number"
                      value={side.height}
                      onChange={(e) => {
                        const newSides = [...sides];
                        newSides[idx].height = Number(e.target.value);
                        setSides(newSides);
                      }}
                      className="w-16 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-brand-primary"
                    />
                  </div>
                )}
              </div>
            ))}
            
            {sides.length === 0 && (
              <div className="col-span-full h-32 flex flex-col items-center justify-center text-slate-400 gap-2 border-2 border-dashed border-slate-100 rounded-[32px]">
                <Pencil className="w-8 h-8 opacity-20" />
                <p className="text-xs font-medium">Desenhe algo para ver os lados aqui</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-80 bg-slate-50 p-6 flex flex-col justify-between border-l border-slate-100">
          <div className="space-y-4">
             <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Maior Medida</div>
                <div className="text-xl font-bold text-slate-900 font-mono">
                  {Math.max(...sides.map(s => s.length), 0).toFixed(1)} cm
                </div>
             </div>
             
             <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                <div className="flex gap-3">
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                  <p className="text-[10px] font-medium text-blue-700 leading-relaxed uppercase">
                    Os adicionais (frontão, saia, virada) são calculados automaticamente por lado e somados ao orçamento final.
                  </p>
                </div>
             </div>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <button 
              onClick={handleSave}
              disabled={!closed || points.length < 3}
              className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" /> Concluir e Salvar
            </button>
            <button 
              onClick={onCancel}
              className="w-full bg-white text-slate-500 py-3 rounded-2xl font-bold hover:bg-slate-100 transition-all text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolButton = ({ icon: Icon, active, onClick, className, title, disabled }: any) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={cn(
      "w-10 h-10 flex items-center justify-center rounded-xl transition-all",
      active ? "bg-brand-primary text-white shadow-lg" : "text-slate-400 hover:bg-slate-50 hover:text-brand-primary",
      disabled && "opacity-20 cursor-not-allowed grayscale",
      className
    )}
  >
    <Icon className="w-5 h-5" />
  </button>
);

const ModelChip = ({ label, onClick }: any) => (
  <button 
    onClick={onClick}
    className="bg-white/90 backdrop-blur shadow-sm border border-slate-100 px-3 py-1.5 rounded-full text-[10px] font-bold text-slate-600 hover:text-brand-primary hover:border-brand-primary transition-all pointer-events-auto"
  >
    {label}
  </button>
);

const SideActionButton = ({ label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex-1 py-1.5 px-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border",
      active 
        ? "bg-green-600 border-green-600 text-white shadow-sm" 
        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
    )}
  >
    {label}
  </button>
);

