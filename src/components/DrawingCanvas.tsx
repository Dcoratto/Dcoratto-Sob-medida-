import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Check,
  CircleDot,
  Eraser,
  Hand,
  HelpCircle,
  LocateFixed,
  MousePointer2,
  Move3D,
  PanelRightOpen,
  Pencil,
  Redo2,
  Ruler,
  Scissors,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {cn, formatArea, formatCentimeters, formatMeasureInput, formatMeters, parseMeasureInput} from '../lib/utils';
import {DrawingCutout, FixtureCatalogItem, PieceSide} from '../types';
import {imageVariantUrl} from '../lib/storage';

type DrawTool = 'select' | 'line' | 'move-point' | 'pan' | 'cutout';
type CutoutType = 'cuba' | 'cooktop' | 'torneira' | 'lixeira' | 'torre_tomada';
type ComplementType = 'frontao' | 'saia' | 'virada' | 'pe' | 'guarnicao';

interface Point {
  x: number;
  y: number;
}

interface TechnicalSide {
  key: string;
  name: string;
  lengthM: number;
  start: Point;
  end: Point;
}

interface SavedDrawing {
  points: Point[];
  closed: boolean;
  sides: PieceSide[];
  cutouts: DrawingCutout[];
  area: number;
  majorSide: number;
  minorSide: number;
  previewImage?: string;
}

interface DrawingHistoryState {
  points: Point[];
  closed: boolean;
  sides: PieceSide[];
  cutouts: DrawingCutout[];
  drawingActive: boolean;
  drawTool: DrawTool;
}

interface DrawingCanvasProps {
  onSave?: (data: {
    json: string;
    area: number;
    previewUrl: string;
    sides: PieceSide[];
    largestSide: number;
    smallestSide: number;
    cutouts: DrawingCutout[];
  }) => void;
  onCancel?: () => void;
  initialJson?: string;
  initialSides?: PieceSide[];
  initialCutouts?: DrawingCutout[];
  fixtureCatalog?: FixtureCatalogItem[];
  className?: string;
  saveButtonId?: string;
  settings?: {
    defaultFrontonHeight?: number;
    defaultSkirtHeight?: number;
    defaultTurnHeight?: number;
  };
}

const SNAP_RADIUS_PX = 12;
const MIN_ZOOM = 45;
const MAX_ZOOM = 420;
const BASE_SCALE = 110;
const GEOMETRY_EPSILON = 0.000001;
const EMPTY_SIDES: PieceSide[] = [];
const complementLabel = (type: ComplementType | PieceSide['type']) => {
  if (type === 'frontao') return 'Frontão';
  if (type === 'saia') return 'Saia';
  if (type === 'virada') return 'Virada';
  if (type === 'pe') return 'Pé';
  if (type === 'guarnicao') return 'Guarnição';
  return String(type || '');
};

const EMPTY_CUTOUTS: DrawingCutout[] = [];

const alphabetName = (index: number) => {
  let value = '';
  let current = index;
  while (current >= 0) {
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26) - 1;
  }
  return `Lado ${value}`;
};

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const samePoint = (a: Point, b: Point, epsilon = GEOMETRY_EPSILON) => distance(a, b) <= epsilon;

const polygonArea = (points: Point[]) => {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum / 2);
};

const orientation = (a: Point, b: Point, c: Point) => {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < GEOMETRY_EPSILON) return 0;
  return value > 0 ?1 : 2;
};

const onSegment = (a: Point, b: Point, c: Point) =>
  b.x <= Math.max(a.x, c.x) + GEOMETRY_EPSILON &&
  b.x >= Math.min(a.x, c.x) - GEOMETRY_EPSILON &&
  b.y <= Math.max(a.y, c.y) + GEOMETRY_EPSILON &&
  b.y >= Math.min(a.y, c.y) - GEOMETRY_EPSILON;

const segmentsIntersect = (p1: Point, q1: Point, p2: Point, q2: Point) => {
  if (samePoint(p1, p2) || samePoint(p1, q2) || samePoint(q1, p2) || samePoint(q1, q2)) {
    return false;
  }

  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
};

const sanitizePolygonPoints = (points: Point[]) => {
  const sanitized = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  if (sanitized.length > 1 && samePoint(sanitized[0], sanitized[sanitized.length - 1])) {
    sanitized.pop();
  }
  return sanitized;
};

const hasCrossingLines = (points: Point[]) => {
  const polygonPoints = sanitizePolygonPoints(points);
  if (polygonPoints.length < 4) return false;

  const segments = polygonPoints.map((point, index) => ({
    start: point,
    end: polygonPoints[(index + 1) % polygonPoints.length],
  })).filter((segment) => !samePoint(segment.start, segment.end));

  if (segments.length < 4) return false;

  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j += 1) {
      const adjacent = Math.abs(i - j) <= 1 || (i === 0 && j === segments.length - 1);
      if (adjacent) continue;
      const b = segments[j];
      if (segmentsIntersect(a.start, a.end, b.start, b.end)) return true;
    }
  }
  return false;
};

const makeSideKey = (index: number) => `side:${index}`;

const defaultHeightFor = (type: ComplementType, settings?: DrawingCanvasProps['settings']) => {
  if (type === 'frontao') return settings?.defaultFrontonHeight ?? 10;
  if (type === 'saia') return settings?.defaultSkirtHeight ?? 4;
  return settings?.defaultTurnHeight ?? 2;
};

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  onSave,
  onCancel,
  initialJson,
  initialSides,
  initialCutouts,
  fixtureCatalog = [],
  className,
  saveButtonId,
  settings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureInputRef = useRef<HTMLInputElement>(null);
  const lastMouseWorld = useRef<Point | null>(null);
  const undoStackRef = useRef<DrawingHistoryState[]>([]);
  const redoStackRef = useRef<DrawingHistoryState[]>([]);
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchZoomRef = useRef<number | null>(null);

  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [ortho, setOrtho] = useState(true);
  const [snap, setSnap] = useState(true);
  const [drawTool, setDrawTool] = useState<DrawTool>('line');
  const [drawingActive, setDrawingActive] = useState(false);
  const [measureBuffer, setMeasureBuffer] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [redoPoints, setRedoPoints] = useState<Point[]>([]);
  const [hoverGuide, setHoverGuide] = useState<number | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [wasDragging, setWasDragging] = useState(false);
  const [zoom, setZoom] = useState(120);
  const [closed, setClosed] = useState(false);
  const [currentMeasure, setCurrentMeasure] = useState('');
  const [lastPiece, setLastPiece] = useState<SavedDrawing | null>(null);
  const [complementos, setComplementos] = useState<PieceSide[]>(initialSides || EMPTY_SIDES);
  const [cutouts, setCutouts] = useState<DrawingCutout[]>(initialCutouts || EMPTY_CUTOUTS);
  const [cutoutType, setCutoutType] = useState<CutoutType>('cuba');
  const [cutoutWidth, setCutoutWidth] = useState('50');
  const [cutoutHeight, setCutoutHeight] = useState('40');
  const [cutoutRotation, setCutoutRotation] = useState<0 | 90>(0);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [fixturePickerOpen, setFixturePickerOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPiecesPanel, setShowPiecesPanel] = useState(false);
  const [sideLengthInputs, setSideLengthInputs] = useState<Record<string, string>>({});
  const [activeSideLengthInput, setActiveSideLengthInput] = useState<string | null>(null);

  const activateCutoutTool = () => {
    setDrawTool('cutout');
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setFixturePickerOpen(true);
    }
  };

  const scale = (BASE_SCALE * zoom) / 100;

  const worldToScreen = useCallback((point: Point): Point => ({
    x: point.x * scale + panX,
    y: point.y * scale + panY,
  }), [panX, panY, scale]);

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return {x: 0, y: 0};
    return {
      x: (clientX - rect.left - panX) / scale,
      y: (clientY - rect.top - panY) / scale,
    };
  }, [panX, panY, scale]);

  const technicalSides = useMemo<TechnicalSide[]>(() => {
    if (drawPoints.length < 2) return [];
    const count = closed ?drawPoints.length : drawPoints.length - 1;
    return Array.from({length: count}, (_, index) => {
      const start = drawPoints[index];
      const end = drawPoints[(index + 1) % drawPoints.length];
      return {
        key: makeSideKey(index),
        name: alphabetName(index),
        lengthM: distance(start, end),
        start,
        end,
      };
    });
  }, [closed, drawPoints]);

  useEffect(() => {
    setSideLengthInputs((current) => {
      const next = {...current};
      technicalSides.forEach((side) => {
        if (activeSideLengthInput === side.key) return;
        next[side.key] = formatMeasureInput(side.lengthM);
      });
      return next;
    });
  }, [activeSideLengthInput, technicalSides]);

  const area = useMemo(() => closed ?polygonArea(drawPoints) : 0, [closed, drawPoints]);
  const majorSideM = useMemo(() => Math.max(0, ...technicalSides.map((side) => side.lengthM)), [technicalSides]);
  const minorSideM = useMemo(() => {
    if (!technicalSides.length) return 0;
    return technicalSides.reduce((smallest, side) => Math.min(smallest, side.lengthM), technicalSides[0].lengthM);
  }, [technicalSides]);
  const additionalArea = useMemo(() => complementos.reduce((total, item) => total + (item.areaTotal || item.area || 0), 0), [complementos]);
  const fixtureCategoryByCutoutType: Record<CutoutType, FixtureCatalogItem['category']> = {
    cooktop: 'cooktop',
    cuba: 'sink',
    torneira: 'faucet',
    lixeira: 'trashBin',
    torre_tomada: 'popUpTower',
  };
  const availableFixtures = useMemo(
    () => fixtureCatalog
      .filter((item) => {
        if (item.active === false) return false;
        const normalizedCategory =
          item.category === 'sink' || item.category === 'cuba' ? 'sink' :
          item.category === 'faucet' || item.category === 'torneira' ? 'faucet' :
          item.category === 'trashBin' || item.category === 'lixeira' ? 'trashBin' :
          item.category === 'popUpTower' || item.category === 'torre_tomada' ? 'popUpTower' :
          item.category;
        return normalizedCategory === fixtureCategoryByCutoutType[cutoutType];
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [cutoutType, fixtureCatalog],
  );
  const selectedFixture = useMemo(
    () => availableFixtures.find((item) => item.id === selectedFixtureId),
    [availableFixtures, selectedFixtureId],
  );
  const totalArea = area + additionalArea;
  const editableSideLabels = useMemo(() => {
    const screenPoints = drawPoints.map(worldToScreen);
    const center = screenPoints.length
      ?{
        x: screenPoints.reduce((sum, point) => sum + point.x, 0) / screenPoints.length,
        y: screenPoints.reduce((sum, point) => sum + point.y, 0) / screenPoints.length,
      }
      : {x: 0, y: 0};

    return technicalSides.map((side, index) => {
      const a = worldToScreen(side.start);
      const b = worldToScreen(side.end);
      const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const normal = {x: -dy / len, y: dx / len};
      const direction = ((mid.x - center.x) * normal.x + (mid.y - center.y) * normal.y) >= 0 ?1 : -1;
      const offset = 34 + (index % 3) * 16;
      return {
        side,
        index,
        x: mid.x + normal.x * direction * offset,
        y: mid.y + normal.y * direction * offset,
      };
    });
  }, [drawPoints, technicalSides, worldToScreen]);

  const currentHistoryState = useCallback((): DrawingHistoryState => ({
    points: drawPoints,
    closed,
    sides: complementos,
    cutouts,
    drawingActive,
    drawTool,
  }), [closed, complementos, cutouts, drawPoints, drawTool, drawingActive]);

  const restoreHistoryState = useCallback((state: DrawingHistoryState) => {
    setDrawPoints(state.points);
    setClosed(state.closed);
    setComplementos(state.sides);
    setCutouts(state.cutouts);
    setDrawingActive(state.drawingActive);
    setDrawTool(state.drawTool);
    setPreviewPoint(null);
    setMeasureBuffer('');
    setDragIndex(null);
    setPanStart(null);
    setWasDragging(false);
    setHoverGuide(null);
  }, []);

  const recordHistory = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), currentHistoryState()];
    redoStackRef.current = [];
  }, [currentHistoryState]);

  const undoLastAction = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current = [...redoStackRef.current.slice(-49), currentHistoryState()];
    restoreHistoryState(previous);
  }, [currentHistoryState, restoreHistoryState]);

  const redoLastAction = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), currentHistoryState()];
    restoreHistoryState(next);
  }, [currentHistoryState, restoreHistoryState]);

  const resetTransientState = useCallback(() => {
    setPreviewPoint(null);
    setMeasureBuffer('');
    setDragIndex(null);
    setPanStart(null);
    setWasDragging(false);
    setHoverGuide(null);
    setDrawTool('line');
    setDrawingActive(false);
    requestAnimationFrame(() => {
      canvasRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    resetTransientState();
    undoStackRef.current = [];
    redoStackRef.current = [];
    if (!initialJson) {
      setDrawPoints([]);
      setClosed(false);
      setCutouts(initialCutouts || EMPTY_CUTOUTS);
      setComplementos(initialSides || EMPTY_SIDES);
      return;
    }

    try {
      const parsed = JSON.parse(initialJson) as Partial<SavedDrawing> & {closed?: boolean};
      setDrawPoints(parsed.points || []);
      setClosed(Boolean(parsed.closed || (parsed.points && parsed.points.length > 2)));
      setCutouts(parsed.cutouts || initialCutouts || EMPTY_CUTOUTS);
      setComplementos(parsed.sides || initialSides || EMPTY_SIDES);
      setLastPiece(parsed as SavedDrawing);
    } catch {
      setDrawPoints([]);
      setClosed(false);
      setCutouts(initialCutouts || EMPTY_CUTOUTS);
      setComplementos(initialSides || EMPTY_SIDES);
    }
  }, [initialJson, resetTransientState]);

  useEffect(() => {
    if (!closed) return;
    setComplementos((current) => current.filter((item) => technicalSides.some((side) => side.key === item.side)));
  }, [closed, technicalSides]);

  useEffect(() => {
    setSelectedFixtureId('');
    setFixturePickerOpen(false);
  }, [cutoutType]);

  useEffect(() => {
    if (!selectedFixture) return;
    const widthCm = selectedFixture.width || selectedFixture.diameter || 0;
    const heightCm = selectedFixture.depth || selectedFixture.height || selectedFixture.diameter || selectedFixture.width || 0;
    if (widthCm) setCutoutWidth(formatMeasureInput(widthCm));
    if (heightCm) setCutoutHeight(formatMeasureInput(heightCm));
  }, [selectedFixture]);

  const applyOrtho = useCallback((origin: Point, target: Point) => {
    if (!ortho) return target;
    const dx = Math.abs(target.x - origin.x);
    const dy = Math.abs(target.y - origin.y);
    return dx >= dy ?{x: target.x, y: origin.y} : {x: origin.x, y: target.y};
  }, [ortho]);

  const snapPoint = useCallback((target: Point) => {
    if (!snap) {
      setHoverGuide(null);
      return target;
    }

    const guideIndex = drawPoints.findIndex((point) => distance(worldToScreen(point), worldToScreen(target)) <= SNAP_RADIUS_PX);
    if (guideIndex >= 0) {
      setHoverGuide(guideIndex);
      return drawPoints[guideIndex];
    }

    setHoverGuide(null);
    return target;
  }, [drawPoints, snap, worldToScreen]);

  const getPointerWorld = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const raw = screenToWorld(event.clientX, event.clientY);
    if (!drawingActive || drawPoints.length === 0) return snapPoint(raw);
    return snapPoint(applyOrtho(drawPoints[drawPoints.length - 1], raw));
  }, [applyOrtho, drawPoints, drawingActive, screenToWorld, snapPoint]);

  const getClientWorld = useCallback((clientX: number, clientY: number) => {
    const raw = screenToWorld(clientX, clientY);
    if (!drawingActive || drawPoints.length === 0) return snapPoint(raw);
    return snapPoint(applyOrtho(drawPoints[drawPoints.length - 1], raw));
  }, [applyOrtho, drawPoints, drawingActive, screenToWorld, snapPoint]);

  const addPoint = useCallback((point: Point) => {
    recordHistory();
    setDrawPoints((current) => [...current, point]);
    setRedoPoints([]);
    setPreviewPoint(null);
    setDrawingActive(true);
    setCurrentMeasure(formatMeters(0));
    setClosed(false);
  }, [recordHistory]);

  const closeGeometry = useCallback(() => {
    if (drawPoints.length < 3) return;
    if (hasCrossingLines(drawPoints)) {
      alert('A geometria tem linhas cruzadas. Ajuste os pontos antes de fechar.');
      return;
    }
    recordHistory();
    setClosed(true);
    setDrawingActive(false);
    setPreviewPoint(null);
    setDrawTool('select');
  }, [drawPoints, recordHistory]);

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    canvasRef.current?.focus();
    const world = getPointerWorld(event);
    lastMouseWorld.current = world;

    if (event.button === 1 || drawTool === 'pan') {
      setPanStart({x: event.clientX - panX, y: event.clientY - panY});
      return;
    }

    if (drawTool === 'move-point') {
      const index = drawPoints.findIndex((point) => distance(worldToScreen(point), {x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY}) <= 12);
      if (index >= 0) setDragIndex(index);
      return;
    }

    if (drawTool === 'cutout') {
      recordHistory();
      const rawWidthCm = selectedFixture?.width || selectedFixture?.diameter || Number(cutoutWidth.replace(',', '.')) || 10;
      const rawHeightCm = selectedFixture?.depth || selectedFixture?.height || selectedFixture?.diameter || selectedFixture?.width || Number(cutoutHeight.replace(',', '.')) || 10;
      const baseWidth = Math.max(0.02, rawWidthCm / 100);
      const baseHeight = cutoutType === 'torneira' || cutoutType === 'torre_tomada'
        ?baseWidth
        : Math.max(0.02, rawHeightCm / 100);
      const width = cutoutRotation === 90 ?baseHeight : baseWidth;
      const height = cutoutRotation === 90 ?baseWidth : baseHeight;
      setCutouts((current) => [...current, {
        id: crypto.randomUUID(),
        type: cutoutType,
        x: world.x,
        y: world.y,
        width,
        height,
        rotation: cutoutRotation,
        fixtureId: selectedFixture?.id,
        fixtureName: selectedFixture?.name,
        fixtureImageUrl: selectedFixture?.imageUrl,
      }]);
      return;
    }

    if (drawTool !== 'line') return;

    if (drawPoints.length >= 3 && hoverGuide === 0) {
      closeGeometry();
      return;
    }

    addPoint(world);
    lastMouseWorld.current = world;
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (panStart) {
      setWasDragging(true);
      setPanX(event.clientX - panStart.x);
      setPanY(event.clientY - panStart.y);
      return;
    }

    const world = getPointerWorld(event);
    lastMouseWorld.current = world;

    if (dragIndex !== null) {
      setWasDragging(true);
      setDrawPoints((current) => current.map((point, index) => index === dragIndex ?world : point));
      return;
    }

    if (drawTool === 'line' && drawPoints.length > 0 && !closed) {
      setPreviewPoint(world);
      const last = drawPoints[drawPoints.length - 1];
      setCurrentMeasure(formatMeters(distance(last, world)));
    } else {
      setCurrentMeasure('');
    }
  };

  const handleCanvasTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const a = event.touches.item(0);
      const b = event.touches.item(1);
      if (!a || !b) return;
      pinchDistanceRef.current = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      pinchZoomRef.current = zoom;
      setPanStart(null);
      setDragIndex(null);
      return;
    }

    if (event.touches.length !== 1) return;
    event.preventDefault();
    canvasRef.current?.focus();
    const touch = event.touches[0];
    const world = getClientWorld(touch.clientX, touch.clientY);
    lastMouseWorld.current = world;

    if (drawTool === 'pan') {
      setPanStart({x: touch.clientX - panX, y: touch.clientY - panY});
      return;
    }

    if (drawTool === 'move-point') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const index = drawPoints.findIndex((point) => distance(worldToScreen(point), {x: touch.clientX - rect.left, y: touch.clientY - rect.top}) <= 18);
      if (index >= 0) setDragIndex(index);
      return;
    }

    if (drawTool === 'cutout') {
      recordHistory();
      const rawWidthCm = selectedFixture?.width || selectedFixture?.diameter || Number(cutoutWidth.replace(',', '.')) || 10;
      const rawHeightCm = selectedFixture?.depth || selectedFixture?.height || selectedFixture?.diameter || selectedFixture?.width || Number(cutoutHeight.replace(',', '.')) || 10;
      const baseWidth = Math.max(0.02, rawWidthCm / 100);
      const baseHeight = cutoutType === 'torneira' || cutoutType === 'torre_tomada'
        ?baseWidth
        : Math.max(0.02, rawHeightCm / 100);
      const width = cutoutRotation === 90 ?baseHeight : baseWidth;
      const height = cutoutRotation === 90 ?baseWidth : baseHeight;
      setCutouts((current) => [...current, {
        id: crypto.randomUUID(),
        type: cutoutType,
        x: world.x,
        y: world.y,
        width,
        height,
        rotation: cutoutRotation,
        fixtureId: selectedFixture?.id,
        fixtureName: selectedFixture?.name,
        fixtureImageUrl: selectedFixture?.imageUrl,
      }]);
      return;
    }

    if (drawTool !== 'line') return;

    if (drawPoints.length >= 3 && hoverGuide === 0) {
      closeGeometry();
      return;
    }

    addPoint(world);
    lastMouseWorld.current = world;
  };

  const handleCanvasTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const a = event.touches.item(0);
      const b = event.touches.item(1);
      if (!a || !b) return;
      const distanceNow = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const startDistance = pinchDistanceRef.current;
      const startZoom = pinchZoomRef.current;
      if (!startDistance || !startZoom) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const before = screenToWorld(midX, midY);
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, startZoom * (distanceNow / startDistance)));
      const nextScale = (BASE_SCALE * nextZoom) / 100;
      setZoom(nextZoom);
      setPanX(midX - rect.left - before.x * nextScale);
      setPanY(midY - rect.top - before.y * nextScale);
      return;
    }

    if (event.touches.length !== 1) return;
    event.preventDefault();
    const touch = event.touches[0];

    if (panStart) {
      setWasDragging(true);
      setPanX(touch.clientX - panStart.x);
      setPanY(touch.clientY - panStart.y);
      return;
    }

    const world = getClientWorld(touch.clientX, touch.clientY);
    lastMouseWorld.current = world;

    if (dragIndex !== null) {
      setWasDragging(true);
      setDrawPoints((current) => current.map((point, index) => index === dragIndex ?world : point));
      return;
    }

    if (drawTool === 'line' && drawPoints.length > 0 && !closed) {
      setPreviewPoint(world);
      const last = drawPoints[drawPoints.length - 1];
      setCurrentMeasure(formatMeters(distance(last, world)));
    } else {
      setCurrentMeasure('');
    }
  };

  useEffect(() => {
    if (drawTool !== 'line' || drawPoints.length === 0 || closed) {
      if (!previewPoint) setCurrentMeasure('');
      return;
    }
    const target = previewPoint || lastMouseWorld.current;
    if (!target) return;
    const last = drawPoints[drawPoints.length - 1];
    setCurrentMeasure(formatMeters(distance(last, target)));
  }, [closed, drawPoints, drawTool, previewPoint]);

  const stopDrag = () => {
    setPanStart(null);
    setDragIndex(null);
    pinchDistanceRef.current = null;
    pinchZoomRef.current = null;
    requestAnimationFrame(() => setWasDragging(false));
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouse = {x: event.clientX - rect.left, y: event.clientY - rect.top};
    const before = screenToWorld(event.clientX, event.clientY);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY < 0 ?1.08 : 0.92)));
    const nextScale = (BASE_SCALE * nextZoom) / 100;
    setZoom(nextZoom);
    setPanX(mouse.x - before.x * nextScale);
    setPanY(mouse.y - before.y * nextScale);
  };

  const handleMeasureSubmit = useCallback(() => {
    if (!measureBuffer.trim() || drawPoints.length === 0) return;
    const value = Number(measureBuffer.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    const origin = drawPoints[drawPoints.length - 1];
    const target = previewPoint || lastMouseWorld.current || {x: origin.x + 1, y: origin.y};
    const directedTarget = applyOrtho(origin, target);
    const dx = directedTarget.x - origin.x;
    const dy = directedTarget.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const nextPoint = {x: origin.x + (dx / length) * value, y: origin.y + (dy / length) * value};
    addPoint(nextPoint);
    lastMouseWorld.current = nextPoint;
    setMeasureBuffer('');
    setPreviewPoint(null);
    setCurrentMeasure(formatMeters(0));
    setDrawingActive(true);
    setDrawTool('line');
    requestAnimationFrame(() => canvasRef.current?.focus());
  }, [addPoint, applyOrtho, drawPoints, measureBuffer, previewPoint]);

  const undoPoint = useCallback(() => {
    setDrawPoints((current) => {
      if (current.length === 0) return current;
      const removed = current[current.length - 1];
      setRedoPoints((redo) => [...redo, removed]);
      return current.slice(0, -1);
    });
    setClosed(false);
    setPreviewPoint(null);
  }, []);

  const redoPoint = useCallback(() => {
    setRedoPoints((current) => {
      if (current.length === 0) return current;
      const next = current[current.length - 1];
      setDrawPoints((points) => [...points, next]);
      return current.slice(0, -1);
    });
    setPreviewPoint(null);
  }, []);

  const clearDrawing = () => {
    recordHistory();
    setDrawPoints([]);
    setPreviewPoint(null);
    setCutouts([]);
    setComplementos([]);
    setClosed(false);
    setRedoPoints([]);
    setLastPiece(null);
    setDrawingActive(false);
    setDrawTool('line');
  };

  const centerDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas || drawPoints.length === 0) {
      setPanX(0);
      setPanY(0);
      setZoom(120);
      return;
    }
    const minX = Math.min(...drawPoints.map((point) => point.x));
    const maxX = Math.max(...drawPoints.map((point) => point.x));
    const minY = Math.min(...drawPoints.map((point) => point.y));
    const maxY = Math.max(...drawPoints.map((point) => point.y));
    const width = Math.max(maxX - minX, 0.1);
    const height = Math.max(maxY - minY, 0.1);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((canvas.width - 160) / (width * BASE_SCALE), (canvas.height - 160) / (height * BASE_SCALE)) * 100));
    const nextScale = BASE_SCALE * nextZoom / 100;
    setZoom(nextZoom);
    setPanX(canvas.width / 2 - ((minX + maxX) / 2) * nextScale);
    setPanY(canvas.height / 2 - ((minY + maxY) / 2) * nextScale);
  };

  const applyTemplate = (template: 'reta' | 'l' | 'ilha' | 'soleira') => {
    recordHistory();
    const templates: Record<typeof template, Point[]> = {
      reta: [{x: 0, y: 0}, {x: 2.4, y: 0}, {x: 2.4, y: 0.6}, {x: 0, y: 0.6}],
      l: [{x: 0, y: 0}, {x: 2.4, y: 0}, {x: 2.4, y: 0.6}, {x: 0.7, y: 0.6}, {x: 0.7, y: 1.8}, {x: 0, y: 1.8}],
      ilha: [{x: 0, y: 0}, {x: 2.0, y: 0}, {x: 2.0, y: 0.9}, {x: 0, y: 0.9}],
      soleira: [{x: 0, y: 0}, {x: 1.2, y: 0}, {x: 1.2, y: 0.18}, {x: 0, y: 0.18}],
    };
    setDrawPoints(templates[template]);
    setClosed(true);
    setPreviewPoint(null);
    setRedoPoints([]);
    setCutouts([]);
    setComplementos([]);
    setDrawingActive(false);
    setDrawTool('select');
    requestAnimationFrame(centerDrawing);
  };

  const updateComplement = (side: TechnicalSide, type: ComplementType, quantity = 1) => {
    recordHistory();
    const height = defaultHeightFor(type, settings);
    const areaUnit = side.lengthM * (height / 100);
    setComplementos((current) => {
      const existingIndex = current.findIndex((item) => item.side === side.key && item.type === type);
      const next: PieceSide = {
        type,
        side: side.key,
        sideLabel: `${side.name} (${formatMeters(side.lengthM)})`,
        length: side.lengthM * 100,
        height,
        quantity,
        area: areaUnit,
        areaTotal: areaUnit * quantity,
        value: 0,
      };
      if (existingIndex >= 0) {
        return current.map((item, index) => index === existingIndex ?{...item, ...next} : item);
      }
      return [...current, next];
    });
  };

  const removeComplement = (sideKey: string, type: ComplementType) => {
    recordHistory();
    setComplementos((current) => current.filter((item) => !(item.side === sideKey && item.type === type)));
  };

  const updateComplementHeight = (sideKey: string, type: ComplementType, height: number) => {
    recordHistory();
    const nextHeight = Math.max(0, Number.isFinite(height) ?height : 0);
    setComplementos((current) => current.map((item) => {
      if (item.side !== sideKey || item.type !== type) return item;
      const areaUnit = (item.length / 100) * (nextHeight / 100);
      const quantity = item.quantity || 1;
      return {...item, height: nextHeight, area: areaUnit, areaTotal: areaUnit * quantity};
    }));
  };

  const removeSegment = (index: number) => {
    recordHistory();
    if (drawPoints.length <= 2) {
      setDrawPoints([]);
      setClosed(false);
      return;
    }
    setDrawPoints((current) => current.filter((_, pointIndex) => pointIndex !== (index + 1) % current.length));
    setClosed(false);
  };

  const editSideLength = (index: number, lengthM: number) => {
    if (!Number.isFinite(lengthM) || lengthM <= 0) return;
    const side = technicalSides[index];
    if (!side) return;
    recordHistory();
    const currentLength = distance(side.start, side.end) || 1;
    const ux = (side.end.x - side.start.x) / currentLength;
    const uy = (side.end.y - side.start.y) / currentLength;
    const newEnd = {x: side.start.x + ux * lengthM, y: side.start.y + uy * lengthM};
    setDrawPoints((current) => current.map((point, pointIndex) => pointIndex === (index + 1) % current.length ?newEnd : point));
  };

  const handleSideLengthFocus = (sideKey: string, value: number) => {
    setActiveSideLengthInput(sideKey);
    setSideLengthInputs((current) => ({...current, [sideKey]: formatMeasureInput(value)}));
  };

  const handleSideLengthChange = (sideKey: string, value: string) => {
    setSideLengthInputs((current) => ({...current, [sideKey]: value}));
  };

  const handleSideLengthBlur = (index: number, sideKey: string) => {
    const parsed = parseMeasureInput(sideLengthInputs[sideKey] || '');
    editSideLength(index, parsed);
    setSideLengthInputs((current) => ({...current, [sideKey]: formatMeasureInput(parsed)}));
    setActiveSideLengthInput((current) => (current === sideKey ? null : current));
  };

  const generatePreview = useCallback(() => {
    if (drawPoints.length === 0) return '';
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const minX = Math.min(...drawPoints.map((point) => point.x));
    const maxX = Math.max(...drawPoints.map((point) => point.x));
    const minY = Math.min(...drawPoints.map((point) => point.y));
    const maxY = Math.max(...drawPoints.map((point) => point.y));
    const width = Math.max(maxX - minX, 0.1);
    const height = Math.max(maxY - minY, 0.1);
    const s = Math.min(560 / width, 360 / height);
    const ox = 350 - ((minX + maxX) / 2) * s;
    const oy = 250 - ((minY + maxY) / 2) * s;
    ctx.fillStyle = '#fbfaf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
    drawPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    if (closed) ctx.closePath();
    ctx.fillStyle = 'rgba(142, 105, 62, 0.14)';
    ctx.strokeStyle = '#8e693e';
    ctx.lineWidth = 0.025;
    if (closed) ctx.fill();
    ctx.stroke();
    cutouts.forEach((cutout) => {
      ctx.save();
      ctx.strokeStyle = '#334155';
      ctx.fillStyle = 'rgba(51, 65, 85, 0.08)';
      ctx.lineWidth = 0.01;
      if (cutout.type === 'torneira') {
        ctx.beginPath();
        ctx.arc(cutout.x, cutout.y, cutout.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(cutout.x - cutout.width / 2, cutout.y - cutout.height / 2, cutout.width, cutout.height);
        ctx.strokeRect(cutout.x - cutout.width / 2, cutout.y - cutout.height / 2, cutout.width, cutout.height);
      }
      ctx.restore();
    });
    ctx.restore();
    return canvas.toDataURL('image/webp', 0.92);
  }, [closed, cutouts, drawPoints]);

  const saveDrawing = () => {
    if (!closed || drawPoints.length < 3) return;
    const previewUrl = generatePreview();
    const payload: SavedDrawing = {
      points: drawPoints,
      closed,
      sides: complementos,
      cutouts,
      area,
      majorSide: majorSideM,
      minorSide: minorSideM,
      previewImage: previewUrl,
    };
    setLastPiece(payload);
    onSave?.({
      json: JSON.stringify(payload),
      area,
      previewUrl,
      sides: complementos,
      largestSide: majorSideM * 100,
      smallestSide: minorSideM * 100,
      cutouts,
    });
  };

  useEffect(() => {
    if (!saveButtonId) return;
    const button = document.getElementById(saveButtonId);
    if (!button) return;
    const handler = () => saveDrawing();
    button.addEventListener('click', handler);
    return () => button.removeEventListener('click', handler);
  }, [saveButtonId, saveDrawing]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTextEditing = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastAction();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoLastAction();
      }
      if (event.key === 'Escape' || event.key === ' ') {
        event.preventDefault();
        setDrawingActive(false);
        setPreviewPoint(null);
        setMeasureBuffer('');
        setDrawTool('select');
      }
      if (!isTextEditing && drawTool === 'line' && drawPoints.length > 0 && !closed && /^[0-9,.]$/.test(event.key)) {
        event.preventDefault();
        setMeasureBuffer((current) => `${current}${event.key}`);
      }
      if (!isTextEditing && drawTool === 'line' && drawPoints.length > 0 && !closed && event.key === 'Backspace') {
        event.preventDefault();
        setMeasureBuffer((current) => current.slice(0, -1));
      }
      if (event.key === 'Enter' && document.activeElement === measureInputRef.current) {
        event.preventDefault();
        handleMeasureSubmit();
      }
      if (!isTextEditing && event.key === 'Enter' && measureBuffer.trim()) {
        event.preventDefault();
        handleMeasureSubmit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closed, drawPoints.length, drawTool, handleMeasureSubmit, measureBuffer, redoLastAction, undoLastAction]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#fbfaf7';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const small = 0.1 * scale;
    const major = 0.5 * scale;
    const drawGrid = (spacing: number, color: string, lineWidth: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      const startX = ((panX % spacing) + spacing) % spacing;
      const startY = ((panY % spacing) + spacing) % spacing;
      for (let x = startX; x < rect.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.height);
        ctx.stroke();
      }
      for (let y = startY; y < rect.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }
    };
    drawGrid(small, '#eee7dc', 0.7);
    drawGrid(major, '#dfd2bf', 1);

    const screenPoints = drawPoints.map(worldToScreen);
    if (screenPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
      screenPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      if (closed) ctx.closePath();
      if (closed) {
        ctx.fillStyle = 'rgba(142, 105, 62, 0.14)';
        ctx.fill();
      }
      ctx.strokeStyle = '#8e693e';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (previewPoint && drawPoints.length > 0 && drawTool === 'line' && !closed) {
      const from = worldToScreen(drawPoints[drawPoints.length - 1]);
      const to = worldToScreen(previewPoint);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#c99b55';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }

    cutouts.forEach((cutout) => {
      const center = worldToScreen(cutout);
      const width = cutout.width * scale;
      const height = cutout.height * scale;
      ctx.save();
      ctx.strokeStyle = cutout.type === 'torneira' ?'#0f766e' : '#334155';
      ctx.fillStyle = cutout.type === 'torneira' ?'rgba(20, 184, 166, 0.12)' : 'rgba(51, 65, 85, 0.08)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      if (cutout.type === 'torneira') {
        ctx.beginPath();
        ctx.arc(center.x, center.y, width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(center.x - width / 2, center.y - height / 2, width, height);
        ctx.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
      }
      ctx.setLineDash([]);
      ctx.font = '700 11px Inter, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.fillText((cutout.fixtureName || cutout.type).toUpperCase(), center.x, center.y - height / 2 - 8);
      ctx.restore();
    });

    const center = screenPoints.length
      ?{x: screenPoints.reduce((sum, point) => sum + point.x, 0) / screenPoints.length, y: screenPoints.reduce((sum, point) => sum + point.y, 0) / screenPoints.length}
      : {x: rect.width / 2, y: rect.height / 2};

    technicalSides.forEach((side, index) => {
      const a = worldToScreen(side.start);
      const b = worldToScreen(side.end);
      const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const normal = {x: -dy / len, y: dx / len};
      const direction = ((mid.x - center.x) * normal.x + (mid.y - center.y) * normal.y) >= 0 ?1 : -1;
      const offset = 34 + (index % 3) * 16;
      const c1 = {x: a.x + normal.x * direction * offset, y: a.y + normal.y * direction * offset};
      const c2 = {x: b.x + normal.x * direction * offset, y: b.y + normal.y * direction * offset};
      const label = `${side.name} ${formatMeters(side.lengthM)}`;
      ctx.save();
      ctx.strokeStyle = '#b6a17e';
      ctx.fillStyle = '#1f2937';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.stroke();
      ctx.translate((c1.x + c2.x) / 2, (c1.y + c2.y) / 2);
      let angle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
      ctx.rotate(angle);
      let fontSize = 13;
      ctx.font = `700 ${fontSize}px Inter, sans-serif`;
      while (ctx.measureText(label).width > len * 0.85 && fontSize > 9) {
        fontSize -= 1;
        ctx.font = `700 ${fontSize}px Inter, sans-serif`;
      }
      const metrics = ctx.measureText(label);
      ctx.fillStyle = 'rgba(255, 252, 245, 0.94)';
      ctx.fillRect(-metrics.width / 2 - 6, -fontSize - 5, metrics.width + 12, fontSize + 10);
      ctx.strokeStyle = '#eadcc6';
      ctx.strokeRect(-metrics.width / 2 - 6, -fontSize - 5, metrics.width + 12, fontSize + 10);
      ctx.fillStyle = '#1f2937';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, -fontSize / 2);
      ctx.restore();
    });

    drawPoints.forEach((point, index) => {
      const screen = worldToScreen(point);
      ctx.beginPath();
      ctx.fillStyle = hoverGuide === index ?'#16a34a' : index === drawPoints.length - 1 ?'#c99b55' : '#8e693e';
      ctx.arc(screen.x, screen.y, hoverGuide === index ?6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fffaf0';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [closed, cutouts, drawPoints, drawTool, hoverGuide, panX, panY, previewPoint, scale, technicalSides, worldToScreen]);

  useEffect(() => {
    draw();
    const listener = () => draw();
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, [draw]);

  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white p-3">
        <ToolButton icon={MousePointer2} label="Selecionar" active={drawTool === 'select'} onClick={() => setDrawTool('select')} />
        <ToolButton icon={Pencil} label="Linha" active={drawTool === 'line'} onClick={() => { setDrawTool('line'); setDrawingActive(drawPoints.length > 0 && !closed); }} />
        <ToolButton icon={Move3D} label="Mover ponto" active={drawTool === 'move-point'} onClick={() => setDrawTool('move-point')} />
        <ToolButton icon={Hand} label="Pan" active={drawTool === 'pan'} onClick={() => setDrawTool('pan')} />
        <ToolButton icon={Scissors} label="Adicionar recorte" active={drawTool === 'cutout'} onClick={activateCutoutTool} />

        <button type="button" onClick={() => setOrtho((value) => !value)} className={cn('rounded-xl px-3 py-2 text-xs font-bold uppercase', ortho ?'bg-brand-primary text-white' : 'bg-slate-100 text-slate-500')}>
          {ortho ?'ORTHO ligado' : 'ORTHO livre'}
        </button>
        <button type="button" onClick={() => setSnap((value) => !value)} className={cn('rounded-xl px-3 py-2 text-xs font-bold uppercase', snap ?'bg-green-600 text-white' : 'bg-slate-100 text-slate-500')}>
          Snap {snap ?'ligado' : 'desligado'}
        </button>

        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
          Linha atual: {currentMeasure || '-'}
        </div>

        <button type="button" onClick={undoLastAction} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:text-brand-primary" title="Desfazer última ação"><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={redoLastAction} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:text-brand-primary" title="Refazer última ação"><Redo2 className="h-4 w-4" /></button>
        <button type="button" onClick={clearDrawing} className="rounded-xl bg-red-50 p-2 text-red-500" title="Limpar desenho"><Eraser className="h-4 w-4" /></button>
        <button type="button" onClick={closeGeometry} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold uppercase text-white">Fechar geometria</button>
        <button type="button" onClick={() => setShowPiecesPanel(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary/10 px-3 py-2 text-xs font-bold uppercase text-brand-primary hover:bg-brand-primary/15">
          <PanelRightOpen className="h-4 w-4" />
          Adicionar peças
        </button>

        <select onChange={(e) => e.target.value && applyTemplate(e.target.value as any)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600" defaultValue="">
          <option value="" disabled>Formato pronto</option>
          <option value="reta">Bancada reta</option>
          <option value="l">Bancada em L</option>
          <option value="ilha">Ilha</option>
          <option value="soleira">Soleira/peitoril</option>
        </select>

        {drawTool === 'cutout' && (
          <div className="hidden w-full items-center gap-2 rounded-2xl border border-brand-primary/10 bg-brand-primary/5 p-2 sm:flex xl:w-auto">
          <select value={cutoutType} onChange={(e) => setCutoutType(e.target.value as CutoutType)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
            <option value="cuba">Cuba</option>
            <option value="cooktop">Cooktop</option>
            <option value="torneira">Torneira</option>
            <option value="lixeira">Lixeira de embutir</option>
            <option value="torre_tomada">Torre de tomada</option>
          </select>
          <div className="relative min-w-[280px]">
            <button
              type="button"
              onClick={() => setFixturePickerOpen((value) => !value)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-600"
            >
              <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {selectedFixture?.imageUrl ?(
                  <img src={imageVariantUrl(selectedFixture, 'thumbnail')} alt={selectedFixture.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
                ) : (
                  <Scissors className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{selectedFixture?.name || 'Peça cadastrada / medida manual'}</span>
                <span className="block truncate text-[11px] font-medium text-slate-400">
                  {selectedFixture ?`${formatCentimeters(selectedFixture.width || selectedFixture.diameter || cutoutWidth)} x ${formatCentimeters(selectedFixture.depth || selectedFixture.height || selectedFixture.diameter || selectedFixture.width || cutoutHeight)}` : 'Escolha uma peça do Admin'}
                </span>
              </span>
            </button>
          </div>
          <input value={cutoutWidth} onChange={(e) => setCutoutWidth(e.target.value)} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" placeholder="Larg./diâm. cm" disabled={Boolean(selectedFixture)} />
          <input value={cutoutHeight} onChange={(e) => setCutoutHeight(e.target.value)} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" placeholder="Alt./prof. cm" disabled={Boolean(selectedFixture) || cutoutType === 'torneira' || cutoutType === 'torre_tomada'} />
          <button
            type="button"
            onClick={() => setCutoutRotation((value) => (value === 0 ?90 : 0))}
            className={cn('rounded-xl px-3 py-2 text-xs font-bold uppercase', cutoutRotation === 90 ?'bg-brand-primary text-white' : 'bg-slate-100 text-slate-500')}
            title="Girar recorte"
          >
            {cutoutRotation === 90 ?'Vertical' : 'Horizontal'}
          </button>
          </div>
        )}

        <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value * 1.12))} className="rounded-xl bg-slate-100 p-2 text-slate-500"><ZoomIn className="h-4 w-4" /></button>
        <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value / 1.12))} className="rounded-xl bg-slate-100 p-2 text-slate-500"><ZoomOut className="h-4 w-4" /></button>
        <button type="button" onClick={centerDrawing} className="rounded-xl bg-slate-100 p-2 text-slate-500"><LocateFixed className="h-4 w-4" /></button>
        <button type="button" onClick={() => setShowHelp((value) => !value)} className={cn('rounded-xl p-2', showHelp ?'bg-brand-primary text-white' : 'bg-slate-100 text-slate-500')} title="Ajuda">
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {drawTool === 'cutout' && (
        <div className="border-b border-slate-100 bg-slate-50 p-3 sm:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Adicionar recorte</div>
              <div className="text-xs font-semibold text-slate-500">Escolha a peça e depois toque no desenho para posicionar.</div>
            </div>
            <button
              type="button"
              onClick={() => setFixturePickerOpen(true)}
              className="rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold uppercase text-white"
            >
              Ver peças
            </button>
          </div>
          <div className="space-y-3">
            <select value={cutoutType} onChange={(e) => setCutoutType(e.target.value as CutoutType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
              <option value="cuba">Cuba</option>
              <option value="cooktop">Cooktop</option>
              <option value="torneira">Torneira</option>
              <option value="lixeira">Lixeira de embutir</option>
              <option value="torre_tomada">Torre de tomada</option>
            </select>

            <button
              type="button"
              onClick={() => setFixturePickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-600"
            >
              <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {selectedFixture?.imageUrl ?(
                  <img src={imageVariantUrl(selectedFixture, 'thumbnail')} alt={selectedFixture.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
                ) : (
                  <Scissors className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{selectedFixture?.name || 'Peça cadastrada / medida manual'}</span>
                <span className="block truncate text-[11px] font-medium text-slate-400">
                  {selectedFixture ?`${formatCentimeters(selectedFixture.width || selectedFixture.diameter || cutoutWidth)} x ${formatCentimeters(selectedFixture.depth || selectedFixture.height || selectedFixture.diameter || selectedFixture.width || cutoutHeight)}` : 'Toque para escolher uma peça'}
                </span>
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <input value={cutoutWidth} onChange={(e) => setCutoutWidth(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" placeholder="Larg./diâm. cm" disabled={Boolean(selectedFixture)} />
              <input value={cutoutHeight} onChange={(e) => setCutoutHeight(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" placeholder="Alt./prof. cm" disabled={Boolean(selectedFixture) || cutoutType === 'torneira' || cutoutType === 'torre_tomada'} />
            </div>

            <button
              type="button"
              onClick={() => setCutoutRotation((value) => (value === 0 ?90 : 0))}
              className={cn('w-full rounded-xl px-3 py-2 text-xs font-bold uppercase', cutoutRotation === 90 ?'bg-brand-primary text-white' : 'bg-white text-slate-500 border border-slate-200')}
              title="Girar recorte"
            >
              {cutoutRotation === 90 ?'Vertical' : 'Horizontal'}
            </button>
          </div>
        </div>
      )}

      {fixturePickerOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/20 p-3 backdrop-blur-[1px]" onClick={() => setFixturePickerOpen(false)}>
          <div className="w-full max-w-[420px] max-h-[72vh] overflow-auto rounded-[28px] border border-slate-100 bg-white p-3 shadow-2xl sm:rounded-2xl sm:p-2" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">Escolher peça</div>
              <div className="text-xs font-semibold text-slate-500">Selecione o modelo do recorte.</div>
            </div>
            <button type="button" onClick={() => setFixturePickerOpen(false)} className="rounded-xl bg-slate-50 p-2 text-slate-400">
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFixtureId('');
              setFixturePickerOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <div className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <Scissors className="h-4 w-4 text-slate-300" />
            </div>
            <span>
              <span className="block">Peça cadastrada / medida manual</span>
              <span className="block text-[11px] text-slate-400">Usar os campos de largura e altura</span>
            </span>
          </button>
          {availableFixtures.map((fixture) => (
            <button
              key={fixture.id}
              type="button"
              onClick={() => {
                setSelectedFixtureId(fixture.id);
                setFixturePickerOpen(false);
              }}
              className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-primary/10', selectedFixtureId === fixture.id ?'bg-brand-primary text-white hover:bg-brand-primary' : 'text-slate-700')}
            >
              <div className={cn('flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border', selectedFixtureId === fixture.id ?'border-white/30 bg-white/15' : 'border-slate-100 bg-slate-50')}>
                {fixture.imageUrl ?(
                  <img src={imageVariantUrl(fixture, 'thumbnail')} alt={fixture.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
                ) : (
                  <Scissors className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <span className="min-w-0">
                <span className="block truncate">{fixture.name}</span>
                <span className={cn('block text-[11px] font-medium', selectedFixtureId === fixture.id ?'text-white/80' : 'text-slate-400')}>
                  {fixture.width || fixture.diameter ?`${formatCentimeters(fixture.width || fixture.diameter)} x ${formatCentimeters(fixture.depth || fixture.height || fixture.diameter || fixture.width)}` : 'Sem medida cadastrada'}
                </span>
              </span>
            </button>
          ))}
          {!availableFixtures.length && (
            <div className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhuma peça cadastrada para este tipo.</div>
          )}
          </div>
        </div>
      )}

      {showPiecesPanel && (
        <div className="fixed inset-x-3 bottom-3 top-auto z-[130] flex max-h-[72vh] w-auto flex-col rounded-[28px] border border-slate-100 bg-white p-4 shadow-2xl sm:right-6 sm:top-1/2 sm:bottom-auto sm:w-[380px] sm:max-w-[calc(100vw-48px)] sm:-translate-y-1/2 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">Adicionar peças</h3>
                <p className="mt-1 text-sm text-slate-400">Escolha frontão, saia, virada ou pé de bancada para cada lado criado.</p>
              </div>
              <button type="button" onClick={() => setShowPiecesPanel(false)} className="rounded-xl bg-slate-50 p-2 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 overflow-auto pr-1">
              {technicalSides.map((side) => {
                const sideComplements = complementos.filter((item) => item.side === side.key);
                const quantity = sideComplements[0]?.quantity || 1;
                return (
                  <div key={side.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{side.name}</div>
                        <div className="text-xs font-mono text-slate-400">{formatMeters(side.lengthM)}</div>
                      </div>
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Qtd
                        <input
                          type="number"
                          min={1}
                          value={quantity}
                          onChange={(event) => {
                            recordHistory();
                            const nextQuantity = Math.max(1, Number(event.target.value));
                            setComplementos((current) => current.map((item) => item.side === side.key ?{
                              ...item,
                              quantity: nextQuantity,
                              areaTotal: (item.area || 0) * nextQuantity,
                            } : item));
                          }}
                          className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-xs text-slate-700"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['frontao', 'saia', 'virada', 'pe', 'guarnicao'] as ComplementType[]).map((type) => {
                        const selected = sideComplements.some((item) => item.type === type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => selected ?removeComplement(side.key, type) : updateComplement(side, type, quantity)}
                            className={cn(
                              'rounded-xl px-2 py-2 text-[10px] font-bold uppercase transition-all',
                              selected ?'bg-green-600 text-white shadow-sm' : 'bg-white text-slate-500 hover:text-brand-primary',
                            )}
                          >
                            {complementLabel(type)}
                          </button>
                        );
                      })}
                    </div>
                    {sideComplements.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {sideComplements.map((item) => (
                          <div key={`${side.key}-${item.type}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-2 py-2">
                            <span className="text-[10px] font-bold uppercase text-slate-500">
                              {complementLabel(item.type)}
                            </span>
                            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Altura (cm)
                              <input
                                type="number"
                                min={0}
                                value={item.height || 0}
                                onChange={(event) => updateComplementHeight(side.key, item.type as ComplementType, Number(event.target.value))}
                                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-xs text-slate-700"
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {technicalSides.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-400">
                  Feche a geometria para liberar os lados.
                </div>
              )}
            </div>
        </div>
      )}

      <div ref={wrapRef} className="relative min-h-[360px] flex-1 sm:min-h-[420px]">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onWheel={handleWheel}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={stopDrag}
          onTouchCancel={stopDrag}
          onContextMenu={(event) => event.preventDefault()}
          className={cn('block h-full w-full select-none outline-none', drawTool === 'pan' ?'cursor-grab touch-none' : drawTool === 'cutout' ?'cursor-cell touch-none' : 'cursor-crosshair touch-none')}
        />
        <div className="absolute bottom-3 left-1/2 flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border border-brand-primary/20 bg-white/95 p-2 shadow-xl sm:bottom-4 sm:w-auto">
          <Ruler className="h-5 w-5 text-brand-primary" />
          <input
            ref={measureInputRef}
            value={measureBuffer}
            onChange={(event) => setMeasureBuffer(event.target.value)}
            placeholder="Medida em m"
            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none sm:w-36 sm:flex-none"
          />
          <button type="button" onClick={handleMeasureSubmit} className="rounded-xl bg-brand-primary p-2 text-white"><Check className="h-4 w-4" /></button>
        </div>
        <div className="absolute right-3 top-3 rounded-2xl border border-slate-100 bg-white/95 p-3 shadow-xl sm:right-4 sm:top-4 sm:p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">área principal</div>
          <div className="text-2xl font-display font-bold text-brand-primary">{formatArea(area)}</div>
          <div className="mt-2 text-xs text-slate-500">Adicionais: {formatArea(additionalArea)}</div>
          <div className="text-xs font-bold text-slate-700">Total: {formatArea(totalArea)}</div>
        </div>
        {showHelp && (
          <div className="absolute left-3 top-20 w-[calc(100%-24px)] max-w-56 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-xl sm:left-4 sm:top-4 sm:w-56">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-700">
              <HelpCircle className="h-4 w-4 text-brand-primary" />
              Como usar
            </div>
            <div className="space-y-2 text-xs font-semibold text-slate-500">
              <div>Scroll: zoom</div>
              <div>Botão do meio: pan</div>
              <div>Enter: confirmar medida</div>
              <div>Esc ou Espaço: parar desenho</div>
            </div>
          </div>
        )}
        {closed && editableSideLabels.map(({side, index, x, y}) => (
          <div
            key={side.key}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-lg border border-amber-100 bg-white/95 px-2 py-1 shadow-sm"
            style={{left: x, top: y}}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="text-[10px] font-bold text-slate-700">{side.name}</span>
            <input
              type="text"
              inputMode="decimal"
              value={sideLengthInputs[side.key] || formatMeasureInput(side.lengthM)}
              onFocus={() => handleSideLengthFocus(side.key, side.lengthM)}
              onChange={(event) => handleSideLengthChange(side.key, event.target.value)}
              onBlur={() => handleSideLengthBlur(index, side.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                  canvasRef.current?.focus();
                }
              }}
              className="w-14 bg-transparent text-center font-mono text-[11px] font-bold text-slate-900 outline-none"
            />
            <span className="text-[10px] font-bold text-slate-500">m</span>
          </div>
        ))}
      </div>

      <div className="hidden">
        <div className="overflow-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-slate-900">Lados e complementos</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{technicalSides.length} lados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-3 py-2">Lado</th>
                  <th className="px-3 py-2">Comprimento</th>
                  <th className="px-3 py-2">Complementos</th>
                  <th className="px-3 py-2">Qtd</th>
                  <th className="px-3 py-2 text-right">Excluir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {technicalSides.map((side, index) => {
                  const sideComplements = complementos.filter((item) => item.side === side.key);
                  const quantity = sideComplements[0]?.quantity || 1;
                  return (
                    <tr key={side.key}>
                      <td className="px-3 py-2 font-bold text-slate-800">{side.name}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sideLengthInputs[side.key] || formatMeasureInput(side.lengthM)}
                          onFocus={() => handleSideLengthFocus(side.key, side.lengthM)}
                          onChange={(event) => handleSideLengthChange(side.key, event.target.value)}
                          onBlur={() => handleSideLengthBlur(index, side.key)}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 font-mono text-sm"
                        /> m
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(['frontao', 'saia', 'virada', 'pe', 'guarnicao'] as ComplementType[]).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => sideComplements.some((item) => item.type === type) ?removeComplement(side.key, type) : updateComplement(side, type, quantity)}
                              className={cn('rounded-lg px-2 py-1 text-[10px] font-bold uppercase', sideComplements.some((item) => item.type === type) ?'bg-green-600 text-white' : 'bg-slate-100 text-slate-500')}
                            >
                              {complementLabel(type)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={quantity}
                          onChange={(event) => {
                            recordHistory();
                            const nextQuantity = Math.max(1, Number(event.target.value));
                            setComplementos((current) => current.map((item) => item.side === side.key ?{
                              ...item,
                              quantity: nextQuantity,
                              areaTotal: (item.area || 0) * nextQuantity,
                            } : item));
                          }}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 font-mono text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeSegment(index)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {cutouts.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Recortes</h4>
              <div className="flex flex-wrap gap-2">
                {cutouts.map((cutout) => (
                  <button
                    key={cutout.id}
                    type="button"
                    onClick={() => {
                      recordHistory();
                      setCutouts((current) => current.filter((item) => item.id !== cutout.id));
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-500"
                  >
                    <CircleDot className="h-3 w-3" />
                    {cutout.fixtureName || cutout.type} {formatCentimeters(cutout.width * 100)} x {formatCentimeters(cutout.height * 100)}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between border-l border-slate-100 bg-slate-50 p-5">
          <div className="space-y-3">
            <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Maior lado</div>
                <div className="font-mono text-xl font-bold text-slate-900">{formatMeters(majorSideM)}</div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Menor lado</div>
                <div className="font-mono text-xl font-bold text-slate-900">{formatMeters(minorSideM)}</div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Persistência</div>
                <p className="mt-1 text-xs text-slate-500">O desenho salva pontos, lados, complementos, recortes, área, maior lado, menor lado e preview PNG.</p>
              </div>
          </div>
          <div className="space-y-2">
            <button type="button" onClick={saveDrawing} disabled={!closed || drawPoints.length < 3} className="w-full rounded-2xl bg-brand-primary py-4 font-bold text-white shadow-lg shadow-brand-primary/20 disabled:opacity-50">
              Adicionar ao orçamento
            </button>
            <button type="button" onClick={onCancel} className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-slate-500 hover:bg-slate-100">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolButton = ({icon: Icon, label, active, onClick}: {icon: any; label: string; active?: boolean; onClick: () => void}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={cn(
      'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-all hover:bg-slate-100',
      active && 'bg-brand-primary text-white hover:bg-brand-primary',
    )}
  >
    <Icon className="h-4 w-4" />
    <span className="hidden xl:inline">{label}</span>
  </button>
);






