'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────
type OverlayKind = 'text' | 'sticker';

interface Overlay {
  id: string;
  kind: OverlayKind;
  cx: number; // 중심 x (원본 좌표계)
  cy: number; // 중심 y
  rotation: number; // deg
  content: string;
  fontSize: number;
  color: string;
  bold: boolean;
  outline: boolean; // 텍스트 가독성용 흰 외곽선
}

interface Adjust {
  brightness: number; // %
  contrast: number; // %
  saturate: number; // %
  grayscale: number; // %
  sepia: number; // %
}

interface Snapshot {
  image: HTMLImageElement;
  imgW: number;
  imgH: number;
  overlays: Overlay[];
  adjust: Adjust;
}

type Tool = 'crop' | 'tone' | 'text' | 'bg';

const DEFAULT_ADJUST: Adjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
};

const STICKERS = ['✨', '❤️', '⭐', '🔥', '👍', '🎉', '💡', '📌', '✅', '❓', '💬', '☀️', '🌸', '🍀', '➡️', '⬇️'];

const FILTER_PRESETS: { name: string; adjust: Adjust }[] = [
  { name: '없음', adjust: { ...DEFAULT_ADJUST } },
  { name: '선명하게', adjust: { ...DEFAULT_ADJUST, contrast: 115, saturate: 120 } },
  { name: '흑백', adjust: { ...DEFAULT_ADJUST, grayscale: 100 } },
  { name: '세피아', adjust: { ...DEFAULT_ADJUST, sepia: 65, saturate: 90 } },
  { name: '빈티지', adjust: { ...DEFAULT_ADJUST, sepia: 35, contrast: 92, brightness: 105, saturate: 85 } },
  { name: '밝게', adjust: { ...DEFAULT_ADJUST, brightness: 118, contrast: 96 } },
];

const MAX_DIMENSION = 4000; // 업로드 시 자동 축소 상한 (성능/메모리 보호)

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
}

function adjustToFilter(a: Adjust): string {
  return `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) grayscale(${a.grayscale}%) sepia(${a.sepia}%)`;
}

// 텍스트 측정용 공용 캔버스
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    measureCtx = c.getContext('2d')!;
  }
  return measureCtx;
}

function overlayFont(ov: Overlay): string {
  return `${ov.bold ? 'bold ' : ''}${ov.fontSize}px "Pretendard", system-ui, sans-serif`;
}

function overlayLines(ov: Overlay): string[] {
  return ov.content.split('\n');
}

function overlayBounds(ov: Overlay): { w: number; h: number } {
  if (ov.kind === 'sticker') {
    return { w: ov.fontSize, h: ov.fontSize };
  }
  const ctx = getMeasureCtx();
  ctx.font = overlayFont(ov);
  const lines = overlayLines(ov);
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line || ' ').width);
  const lineH = ov.fontSize * 1.25;
  return { w: w + ov.fontSize * 0.2, h: lineH * lines.length };
}

function drawOverlay(ctx: CanvasRenderingContext2D, ov: Overlay) {
  ctx.save();
  ctx.translate(ov.cx, ov.cy);
  ctx.rotate((ov.rotation * Math.PI) / 180);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (ov.kind === 'sticker') {
    ctx.font = `${ov.fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillText(ov.content, 0, 0);
  } else {
    ctx.font = overlayFont(ov);
    const lines = overlayLines(ov);
    const lineH = ov.fontSize * 1.25;
    const startY = -((lines.length - 1) * lineH) / 2;
    if (ov.outline) {
      ctx.lineWidth = Math.max(2, ov.fontSize * 0.12);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineJoin = 'round';
    }
    lines.forEach((line, i) => {
      const y = startY + i * lineH;
      if (ov.outline) ctx.strokeText(line, 0, y);
      ctx.fillStyle = ov.color;
      ctx.fillText(line, 0, y);
    });
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────
export default function ImageEditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imgW, setImgW] = useState(0);
  const [imgH, setImgH] = useState(0);

  const [adjust, setAdjust] = useState<Adjust>({ ...DEFAULT_ADJUST });
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>('crop');
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [resizeW, setResizeW] = useState<string>('');

  const [history, setHistory] = useState<Snapshot[]>([]);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgProgress, setBgProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 포인터 드래그 상태 (렌더 유발 불필요 → ref)
  const dragRef = useRef<
    | { mode: 'move'; id: string; offx: number; offy: number }
    | { mode: 'crop-new'; startX: number; startY: number }
    | { mode: 'crop-move'; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } }
    | null
  >(null);

  const selected = useMemo(() => overlays.find(o => o.id === selectedId) ?? null, [overlays, selectedId]);

  // ── 원본 좌표계 렌더 ──────────────────────────
  const paint = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      opts: { withOverlays?: boolean; withUI?: boolean; background?: string | null } = {},
    ) => {
      const { withOverlays = true, withUI = false, background = null } = opts;
      ctx.clearRect(0, 0, imgW, imgH);
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, imgW, imgH);
      }
      if (image) {
        ctx.filter = adjustToFilter(adjust);
        ctx.drawImage(image, 0, 0, imgW, imgH);
        ctx.filter = 'none';
      }
      if (withOverlays) {
        for (const ov of overlays) drawOverlay(ctx, ov);
      }
      if (withUI) {
        // 선택된 오버레이 테두리
        if (selected) {
          const b = overlayBounds(selected);
          ctx.save();
          ctx.translate(selected.cx, selected.cy);
          ctx.rotate((selected.rotation * Math.PI) / 180);
          ctx.strokeStyle = '#CC9486';
          ctx.lineWidth = Math.max(1.5, imgW / 400);
          ctx.setLineDash([Math.max(4, imgW / 120), Math.max(3, imgW / 160)]);
          ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.restore();
        }
        // 크롭 영역
        if (tool === 'crop' && cropRect) {
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          ctx.rect(0, 0, imgW, imgH);
          ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
          ctx.fill('evenodd');
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1.5, imgW / 400);
          ctx.setLineDash([]);
          ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
          // 삼분할 가이드
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = Math.max(1, imgW / 800);
          for (let i = 1; i < 3; i++) {
            const gx = cropRect.x + (cropRect.w * i) / 3;
            const gy = cropRect.y + (cropRect.h * i) / 3;
            ctx.beginPath();
            ctx.moveTo(gx, cropRect.y);
            ctx.lineTo(gx, cropRect.y + cropRect.h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cropRect.x, gy);
            ctx.lineTo(cropRect.x + cropRect.w, gy);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    },
    [image, imgW, imgH, adjust, overlays, selected, tool, cropRect],
  );

  // ── 화면 캔버스 그리기 ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paint(ctx, { withOverlays: true, withUI: true });
  }, [paint, image, imgW, imgH]);

  // ── 파일 로드 ─────────────────────────────────
  const loadFromFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      let img = await loadImage(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      // 너무 크면 자동 축소
      if (Math.max(w, h) > MAX_DIMENSION) {
        const s = MAX_DIMENSION / Math.max(w, h);
        const nw = Math.round(w * s);
        const nh = Math.round(h * s);
        const off = document.createElement('canvas');
        off.width = nw;
        off.height = nh;
        off.getContext('2d')!.drawImage(img, 0, 0, nw, nh);
        img = await loadImage(off.toDataURL('image/png'));
        w = nw;
        h = nh;
      }
      URL.revokeObjectURL(url);
      setImage(img);
      setImgW(w);
      setImgH(h);
      setOverlays([]);
      setSelectedId(null);
      setAdjust({ ...DEFAULT_ADJUST });
      setCropRect(null);
      setHistory([]);
      setResizeW(String(w));
      setTool('crop');
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 불러오지 못했습니다.');
    }
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFromFile(file);
  };

  // ── 히스토리(되돌리기) ────────────────────────
  const pushHistory = useCallback(() => {
    if (!image) return;
    setHistory(h =>
      [...h, { image, imgW, imgH, overlays: overlays.map(o => ({ ...o })), adjust: { ...adjust } }].slice(-20),
    );
  }, [image, imgW, imgH, overlays, adjust]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setImage(prev.image);
      setImgW(prev.imgW);
      setImgH(prev.imgH);
      setOverlays(prev.overlays.map(o => ({ ...o })));
      setAdjust({ ...prev.adjust });
      setResizeW(String(prev.imgW));
      setCropRect(null);
      setSelectedId(null);
      return h.slice(0, -1);
    });
  }, []);

  // ── 좌표 변환 ─────────────────────────────────
  const toImagePoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const hitTestOverlay = (x: number, y: number): Overlay | null => {
    // 위에 그려진 것 우선 (뒤에서부터)
    for (let i = overlays.length - 1; i >= 0; i--) {
      const ov = overlays[i]!;
      const b = overlayBounds(ov);
      const rad = (-ov.rotation * Math.PI) / 180;
      const dx = x - ov.cx;
      const dy = y - ov.cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      const pad = ov.fontSize * 0.3;
      if (Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad) return ov;
    }
    return null;
  };

  // ── 포인터 핸들러 ─────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const p = toImagePoint(e);
    canvasRef.current?.setPointerCapture(e.pointerId);

    if (tool === 'crop') {
      if (cropRect && p.x >= cropRect.x && p.x <= cropRect.x + cropRect.w && p.y >= cropRect.y && p.y <= cropRect.y + cropRect.h) {
        dragRef.current = { mode: 'crop-move', startX: p.x, startY: p.y, orig: { ...cropRect } };
      } else {
        dragRef.current = { mode: 'crop-new', startX: p.x, startY: p.y };
        setCropRect({ x: p.x, y: p.y, w: 0, h: 0 });
      }
      return;
    }

    // 이동/선택
    const hit = hitTestOverlay(p.x, p.y);
    if (hit) {
      setSelectedId(hit.id);
      dragRef.current = { mode: 'move', id: hit.id, offx: p.x - hit.cx, offy: p.y - hit.cy };
    } else {
      setSelectedId(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toImagePoint(e);

    if (d.mode === 'move') {
      setOverlays(prev => prev.map(o => (o.id === d.id ? { ...o, cx: p.x, cy: p.y } : o)));
    } else if (d.mode === 'crop-new') {
      const x = Math.min(d.startX, p.x);
      const y = Math.min(d.startY, p.y);
      const w = Math.abs(p.x - d.startX);
      const h = Math.abs(p.y - d.startY);
      setCropRect({ x, y, w, h });
    } else if (d.mode === 'crop-move') {
      let nx = d.orig.x + (p.x - d.startX);
      let ny = d.orig.y + (p.y - d.startY);
      nx = Math.max(0, Math.min(nx, imgW - d.orig.w));
      ny = Math.max(0, Math.min(ny, imgH - d.orig.h));
      setCropRect({ x: nx, y: ny, w: d.orig.w, h: d.orig.h });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    const d = dragRef.current;
    dragRef.current = null;
    if (d && (d.mode === 'crop-new')) {
      // 너무 작은 크롭은 무시
      setCropRect(cur => (cur && (cur.w < 8 || cur.h < 8) ? null : cur));
    }
  };

  // ── 자르기 적용 ───────────────────────────────
  const applyCrop = async () => {
    if (!image || !cropRect) return;
    const rx = Math.round(Math.max(0, cropRect.x));
    const ry = Math.round(Math.max(0, cropRect.y));
    const rw = Math.round(Math.min(cropRect.w, imgW - rx));
    const rh = Math.round(Math.min(cropRect.h, imgH - ry));
    if (rw < 4 || rh < 4) return;
    pushHistory();
    const off = document.createElement('canvas');
    off.width = rw;
    off.height = rh;
    const octx = off.getContext('2d')!;
    octx.filter = adjustToFilter(adjust);
    octx.drawImage(image, rx, ry, rw, rh, 0, 0, rw, rh);
    const newImg = await loadImage(off.toDataURL('image/png'));
    setImage(newImg);
    setImgW(rw);
    setImgH(rh);
    setAdjust({ ...DEFAULT_ADJUST });
    setOverlays(prev => prev.map(o => ({ ...o, cx: o.cx - rx, cy: o.cy - ry })));
    setResizeW(String(rw));
    setCropRect(null);
  };

  // ── 회전 / 뒤집기 (전체 합성 후 베이크) ─────────
  const bakeComposite = useCallback(async (): Promise<HTMLImageElement> => {
    const off = document.createElement('canvas');
    off.width = imgW;
    off.height = imgH;
    paint(off.getContext('2d')!, { withOverlays: true, withUI: false });
    return loadImage(off.toDataURL('image/png'));
  }, [imgW, imgH, paint]);

  const rotate90 = async (dir: 'cw' | 'ccw') => {
    if (!image) return;
    pushHistory();
    const composite = await bakeComposite();
    const off = document.createElement('canvas');
    off.width = imgH;
    off.height = imgW;
    const octx = off.getContext('2d')!;
    octx.translate(off.width / 2, off.height / 2);
    octx.rotate(((dir === 'cw' ? 90 : -90) * Math.PI) / 180);
    octx.drawImage(composite, -imgW / 2, -imgH / 2);
    const newImg = await loadImage(off.toDataURL('image/png'));
    setImage(newImg);
    setImgW(off.width);
    setImgH(off.height);
    setAdjust({ ...DEFAULT_ADJUST });
    setOverlays([]);
    setSelectedId(null);
    setResizeW(String(off.width));
    setCropRect(null);
  };

  const flip = async (axis: 'h' | 'v') => {
    if (!image) return;
    pushHistory();
    const composite = await bakeComposite();
    const off = document.createElement('canvas');
    off.width = imgW;
    off.height = imgH;
    const octx = off.getContext('2d')!;
    octx.translate(axis === 'h' ? imgW : 0, axis === 'v' ? imgH : 0);
    octx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    octx.drawImage(composite, 0, 0);
    const newImg = await loadImage(off.toDataURL('image/png'));
    setImage(newImg);
    setAdjust({ ...DEFAULT_ADJUST });
    setOverlays([]);
    setSelectedId(null);
    setCropRect(null);
  };

  // ── 리사이즈 ──────────────────────────────────
  const applyResize = async () => {
    if (!image) return;
    const target = parseInt(resizeW, 10);
    if (!Number.isFinite(target) || target < 16 || target > MAX_DIMENSION) {
      setError(`가로 크기는 16 ~ ${MAX_DIMENSION}px 사이로 입력해주세요.`);
      return;
    }
    if (target === imgW) return;
    pushHistory();
    const s = target / imgW;
    const nw = target;
    const nh = Math.round(imgH * s);
    const off = document.createElement('canvas');
    off.width = nw;
    off.height = nh;
    const octx = off.getContext('2d')!;
    octx.imageSmoothingQuality = 'high';
    octx.filter = adjustToFilter(adjust);
    octx.drawImage(image, 0, 0, nw, nh);
    const newImg = await loadImage(off.toDataURL('image/png'));
    setImage(newImg);
    setImgW(nw);
    setImgH(nh);
    setAdjust({ ...DEFAULT_ADJUST });
    setOverlays(prev => prev.map(o => ({ ...o, cx: o.cx * s, cy: o.cy * s, fontSize: o.fontSize * s })));
    setResizeW(String(nw));
    setCropRect(null);
    setError(null);
  };

  // ── 배경 제거 ─────────────────────────────────
  const removeBg = async () => {
    if (!image || bgBusy) return;
    setError(null);
    setBgBusy(true);
    setBgProgress('준비 중…');
    try {
      // 현재 톤 조정을 베이크한 원본을 소스로 사용 (오버레이는 위에 유지)
      const off = document.createElement('canvas');
      off.width = imgW;
      off.height = imgH;
      const octx = off.getContext('2d')!;
      octx.filter = adjustToFilter(adjust);
      octx.drawImage(image, 0, 0, imgW, imgH);
      const srcBlob: Blob = await new Promise((res, rej) =>
        off.toBlob(b => (b ? res(b) : rej(new Error('이미지 처리 실패'))), 'image/png'),
      );

      const { removeBackground } = await import('@imgly/background-removal');
      const resultBlob = await removeBackground(srcBlob, {
        progress: (key: string, current: number, total: number) => {
          if (key.startsWith('fetch')) {
            setBgProgress(`AI 모델 다운로드 중… ${total ? Math.round((current / total) * 100) : 0}%`);
          } else {
            setBgProgress('배경 분석 중…');
          }
        },
        output: { format: 'image/png' },
      });

      pushHistory();
      const url = URL.createObjectURL(resultBlob);
      const newImg = await loadImage(url);
      URL.revokeObjectURL(url);
      setImage(newImg);
      setAdjust({ ...DEFAULT_ADJUST });
      setCropRect(null);
    } catch (e) {
      console.error('배경 제거 실패:', e);
      setError('배경 제거에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setBgBusy(false);
      setBgProgress('');
    }
  };

  // ── 오버레이 편집 ─────────────────────────────
  const addText = () => {
    const ov: Overlay = {
      id: crypto.randomUUID(),
      kind: 'text',
      cx: imgW / 2,
      cy: imgH / 2,
      rotation: 0,
      content: '텍스트 입력',
      fontSize: Math.max(24, Math.round(imgW / 12)),
      color: '#2D2D2D',
      bold: true,
      outline: true,
    };
    setOverlays(prev => [...prev, ov]);
    setSelectedId(ov.id);
    setTool('text');
  };

  const addSticker = (emoji: string) => {
    const ov: Overlay = {
      id: crypto.randomUUID(),
      kind: 'sticker',
      cx: imgW / 2,
      cy: imgH / 2,
      rotation: 0,
      content: emoji,
      fontSize: Math.max(48, Math.round(imgW / 8)),
      color: '#000000',
      bold: false,
      outline: false,
    };
    setOverlays(prev => [...prev, ov]);
    setSelectedId(ov.id);
    setTool('text');
  };

  const updateSelected = (patch: Partial<Overlay>) => {
    if (!selectedId) return;
    setOverlays(prev => prev.map(o => (o.id === selectedId ? { ...o, ...patch } : o)));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setOverlays(prev => prev.filter(o => o.id !== selectedId));
    setSelectedId(null);
  };

  // ── 내보내기 ──────────────────────────────────
  const download = async (format: 'png' | 'jpeg') => {
    if (!image) return;
    const off = document.createElement('canvas');
    off.width = imgW;
    off.height = imgH;
    const octx = off.getContext('2d')!;
    paint(octx, { withOverlays: true, withUI: false, background: format === 'jpeg' ? '#FFFFFF' : null });
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob: Blob = await new Promise((res, rej) =>
      off.toBlob(b => (b ? res(b) : rej(new Error('내보내기 실패'))), mime, format === 'jpeg' ? 0.95 : undefined),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reset = () => {
    setImage(null);
    setImgW(0);
    setImgH(0);
    setOverlays([]);
    setSelectedId(null);
    setAdjust({ ...DEFAULT_ADJUST });
    setCropRect(null);
    setHistory([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const TOOLS: { key: Tool; label: string; icon: string }[] = [
    { key: 'crop', label: '자르기·회전', icon: '✂️' },
    { key: 'tone', label: '톤 조정', icon: '🎨' },
    { key: 'text', label: '텍스트·스티커', icon: '🔤' },
    { key: 'bg', label: '배경 제거', icon: '🖼️' },
  ];

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="text-center pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">IMAGE TOOLS</p>
        <h1 className="type-page-title text-text mb-3">이미지 편집기</h1>
        <p className="text-sm text-dim leading-relaxed">
          가지고 있는 이미지를 자르고, 톤을 조정하고, 텍스트·스티커를 넣고, 배경까지 제거하세요.
          <br className="hidden md:block" />
          모든 편집은 브라우저 안에서 처리되어 서버로 전송되지 않습니다.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {!image ? (
        /* 업로드 영역 */
        <div
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void loadFromFile(file);
          }}
          className={`bg-surface rounded-lg border-2 border-dashed p-12 text-center transition ${
            dragOver ? 'border-accent bg-accent/5' : 'border-border'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileInput}
            className="hidden"
          />
                    <p className="text-base font-semibold text-text mb-2">편집할 이미지를 선택하세요</p>
          <p className="text-xs text-dim mb-5">여기로 파일을 끌어다 놓거나 버튼을 눌러 선택하세요 (JPG, PNG, WebP 등)</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition"
          >
            파일 선택
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          {/* 캔버스 */}
          <div className="space-y-3">
            <div
              className="rounded-lg border border-border overflow-hidden flex items-center justify-center p-3"
              style={{
                backgroundColor: '#f4f4f4',
                backgroundImage:
                  'linear-gradient(45deg,#e2e2e2 25%,transparent 25%),linear-gradient(-45deg,#e2e2e2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e2e2 75%),linear-gradient(-45deg,transparent 75%,#e2e2e2 75%)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="max-w-full max-h-[62vh] object-contain touch-none"
                style={{ cursor: tool === 'crop' ? 'crosshair' : 'move' }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={undo}
                  disabled={history.length === 0}
                  className="px-3 py-1.5 bg-border text-text text-xs font-bold rounded-lg hover:bg-accent2 transition disabled:opacity-40"
                >
                  ↩ 되돌리기{history.length > 0 ? ` (${history.length})` : ''}
                </button>
                <button
                  onClick={reset}
                  className="px-3 py-1.5 bg-border text-text text-xs font-bold rounded-lg hover:bg-accent2 transition"
                >
                  🔁 새 이미지
                </button>
              </div>
              <span className="text-xs text-dim">
                {imgW} × {imgH}px
              </span>
            </div>
          </div>

          {/* 도구 패널 */}
          <div className="space-y-4">
            {/* 탭 */}
            <div className="grid grid-cols-4 gap-1.5 bg-bg rounded-xl p-1.5">
              {TOOLS.map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTool(t.key);
                    if (t.key !== 'crop') setCropRect(null);
                  }}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-bold transition ${
                    tool === t.key ? 'bg-accent text-white shadow-sm' : 'text-dim hover:text-text'
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 자르기·회전 */}
            {tool === 'crop' && (
              <div className="space-y-4 bg-surface border border-border rounded-lg p-4">
                <div>
                  <p className="text-sm font-bold text-text mb-2">자르기</p>
                  <p className="text-xs text-dim mb-3">이미지 위에서 드래그해 영역을 지정한 뒤 적용하세요.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={applyCrop}
                      disabled={!cropRect || cropRect.w < 8}
                      className="flex-1 px-3 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition disabled:opacity-40"
                    >
                      자르기 적용
                    </button>
                    <button
                      onClick={() => setCropRect(null)}
                      disabled={!cropRect}
                      className="px-3 py-2 bg-border text-text text-xs font-bold rounded-lg hover:bg-accent2 transition disabled:opacity-40"
                    >
                      취소
                    </button>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-sm font-bold text-text mb-2">회전 · 뒤집기</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => rotate90('ccw')} className="px-3 py-2 bg-bg text-text text-xs font-bold rounded-lg hover:bg-accent2 transition">↺ 왼쪽 90°</button>
                    <button onClick={() => rotate90('cw')} className="px-3 py-2 bg-bg text-text text-xs font-bold rounded-lg hover:bg-accent2 transition">↻ 오른쪽 90°</button>
                    <button onClick={() => flip('h')} className="px-3 py-2 bg-bg text-text text-xs font-bold rounded-lg hover:bg-accent2 transition">↔ 좌우 반전</button>
                    <button onClick={() => flip('v')} className="px-3 py-2 bg-bg text-text text-xs font-bold rounded-lg hover:bg-accent2 transition">↕ 상하 반전</button>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-sm font-bold text-text mb-2">크기 조정</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={resizeW}
                      onChange={e => setResizeW(e.target.value)}
                      className="w-24 px-2 py-1.5 border border-border rounded-lg text-sm text-text bg-surface"
                    />
                    <span className="text-xs text-dim">px (가로)</span>
                    <button onClick={applyResize} className="ml-auto px-3 py-1.5 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition">적용</button>
                  </div>
                  <p className="text-[11px] text-dim mt-1.5">세로는 비율에 맞춰 자동 조정됩니다.</p>
                </div>
              </div>
            )}

            {/* 톤 조정 */}
            {tool === 'tone' && (
              <div className="space-y-4 bg-surface border border-border rounded-lg p-4">
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => setAdjust({ ...p.adjust })}
                      className="px-2.5 py-1.5 bg-bg text-text text-[11px] font-bold rounded-lg hover:bg-accent2 transition"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                {(
                  [
                    { key: 'brightness', label: '밝기', min: 0, max: 200 },
                    { key: 'contrast', label: '대비', min: 0, max: 200 },
                    { key: 'saturate', label: '채도', min: 0, max: 200 },
                    { key: 'grayscale', label: '흑백', min: 0, max: 100 },
                    { key: 'sepia', label: '세피아', min: 0, max: 100 },
                  ] as const
                ).map(s => (
                  <div key={s.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-text">{s.label}</span>
                      <span className="text-dim font-rank">{adjust[s.key]}%</span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      value={adjust[s.key]}
                      onChange={e => setAdjust(a => ({ ...a, [s.key]: Number(e.target.value) }))}
                      className="w-full accent-accent"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setAdjust({ ...DEFAULT_ADJUST })}
                  className="w-full px-3 py-2 bg-border text-text text-xs font-bold rounded-lg hover:bg-accent2 transition"
                >
                  톤 초기화
                </button>
              </div>
            )}

            {/* 텍스트·스티커 */}
            {tool === 'text' && (
              <div className="space-y-4 bg-surface border border-border rounded-lg p-4">
                <div className="flex gap-2">
                  <button onClick={addText} className="flex-1 px-3 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition">+ 텍스트 추가</button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-text mb-2">스티커</p>
                  <div className="grid grid-cols-8 gap-1">
                    {STICKERS.map(s => (
                      <button
                        key={s}
                        onClick={() => addSticker(s)}
                        className="aspect-square text-lg rounded-lg hover:bg-bg transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {selected ? (
                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-xs font-bold text-accent">선택된 {selected.kind === 'text' ? '텍스트' : '스티커'} 편집</p>
                    {selected.kind === 'text' && (
                      <>
                        <textarea
                          value={selected.content}
                          onChange={e => updateSelected({ content: e.target.value })}
                          rows={2}
                          className="w-full px-2.5 py-2 border border-border rounded-lg text-sm text-text bg-surface resize-none"
                          placeholder="문구 입력 (줄바꿈 가능)"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-dim">색상</label>
                          <input
                            type="color"
                            value={selected.color}
                            onChange={e => updateSelected({ color: e.target.value })}
                            className="h-7 w-10 rounded border border-border bg-surface"
                          />
                          <button
                            onClick={() => updateSelected({ bold: !selected.bold })}
                            className={`px-2 py-1 text-xs font-bold rounded ${selected.bold ? 'bg-accent text-white' : 'bg-bg text-text'}`}
                          >
                            굵게
                          </button>
                          <button
                            onClick={() => updateSelected({ outline: !selected.outline })}
                            className={`px-2 py-1 text-xs font-bold rounded ${selected.outline ? 'bg-accent text-white' : 'bg-bg text-text'}`}
                          >
                            외곽선
                          </button>
                        </div>
                      </>
                    )}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-text">크기</span>
                        <span className="text-dim font-rank">{Math.round(selected.fontSize)}</span>
                      </div>
                      <input
                        type="range"
                        min={12}
                        max={Math.max(200, Math.round(imgW / 2))}
                        value={selected.fontSize}
                        onChange={e => updateSelected({ fontSize: Number(e.target.value) })}
                        className="w-full accent-accent"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-text">회전</span>
                        <span className="text-dim font-rank">{selected.rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={selected.rotation}
                        onChange={e => updateSelected({ rotation: Number(e.target.value) })}
                        className="w-full accent-accent"
                      />
                    </div>
                    <button
                      onClick={deleteSelected}
                      className="w-full px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition"
                    >
                      🗑 삭제
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-dim border-t border-border pt-3">
                    캔버스에서 텍스트·스티커를 눌러 선택하면 편집할 수 있어요. 드래그해서 위치를 옮기세요.
                  </p>
                )}
              </div>
            )}

            {/* 배경 제거 */}
            {tool === 'bg' && (
              <div className="space-y-3 bg-surface border border-border rounded-lg p-4">
                <p className="text-sm font-bold text-text">AI 배경 제거</p>
                <p className="text-xs text-dim leading-relaxed">
                  피사체만 남기고 배경을 투명하게 만듭니다. 브라우저에서 직접 처리되며, 처음 실행 시 AI 모델을 한 번 내려받습니다(수십 초 소요될 수 있어요).
                </p>
                <button
                  onClick={removeBg}
                  disabled={bgBusy}
                  className="w-full px-3 py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bgBusy ? (
                    <>
                      <span className="inline-block animate-spin">⏳</span>
                      {bgProgress || '처리 중…'}
                    </>
                  ) : (
                    '배경 제거하기'
                  )}
                </button>
                <p className="text-[11px] text-dim">투명 배경을 유지하려면 PNG로 저장하세요.</p>
              </div>
            )}

            {/* 저장 */}
            <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-bold text-text mb-1">저장</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => download('png')} className="px-3 py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition">PNG 저장</button>
                <button onClick={() => download('jpeg')} className="px-3 py-2.5 bg-accent2 text-text text-sm font-bold rounded-lg hover:bg-accent2-hover transition">JPG 저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 안내 */}
      <div className="bg-bg rounded-xl p-5 space-y-3">
        <h3 className="font-bold text-text text-sm">사용 팁</h3>
        <ul className="text-xs text-dim space-y-2">
          <li>• 모든 편집은 브라우저에서 처리되며 이미지가 서버로 전송되지 않습니다.</li>
          <li>• 자르기·회전·크기 조정은 되돌리기(↩)로 취소할 수 있습니다.</li>
          <li>• 텍스트·스티커는 캔버스에서 드래그해 위치를 옮기고, 우측 패널에서 크기·회전·색상을 조정하세요.</li>
          <li>• 배경 제거 후 투명 배경을 유지하려면 PNG로 저장하세요. (JPG는 흰색 배경으로 채워집니다.)</li>
        </ul>
      </div>
    </div>
  );
}
