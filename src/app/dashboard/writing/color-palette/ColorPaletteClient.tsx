'use client';
import { useEffect, useRef, useState } from 'react';
import { extractPalette } from '@/lib/color-extract';
import {
  assignRoles,
  formatHsl,
  formatRgb,
  generateHarmony,
  nameColor,
  rgbToHex,
  CATEGORY_PALETTES,
  HARMONY_LABELS,
  type HarmonyMode,
} from '@/lib/color-harmony';

const HARMONY_MODES: HarmonyMode[] = [
  'random', 'complementary', 'analogous', 'monochromatic',
  'triadic', 'warm', 'cool', 'pastel',
];

const CATEGORY_NAMES = Object.keys(CATEGORY_PALETTES);
const STORAGE_KEY = 'ninfle-saved-color-palettes';
const MAX_IMAGE_DIMENSION = 200; // 색상 추출용 다운스케일 — 원본 화질과 무관, 속도만 좌우

type ColorFormat = 'hex' | 'rgb' | 'hsl';

function formatColor(hex: string, format: ColorFormat): string {
  if (format === 'rgb') return formatRgb(hex);
  if (format === 'hsl') return formatHsl(hex);
  return hex;
}

export default function ColorPaletteClient() {
  const [palette, setPalette] = useState<string[] | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [thumbTitle, setThumbTitle] = useState('말의 품격을 읽고\n내가 다시 생각하게 된 것들');
  const [savedPalettes, setSavedPalettes] = useState<string[][]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedPalettes(JSON.parse(raw));
    } catch {
      // 저장된 팔레트 없음/파싱 실패 — 무시
    }
  }, []);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
    } catch {
      // ignore
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일(JPG/PNG/WebP)만 업로드할 수 있습니다.');
      return;
    }
    setError(null);
    setExtracting(true);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setError('이미지를 분석할 수 없습니다.');
          setExtracting(false);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const colors = extractPalette(imageData, 5);
          setPalette(colors.map((c) => rgbToHex(c.r, c.g, c.b)));
        } catch {
          setError('이미지 분석 중 오류가 발생했습니다.');
        } finally {
          setExtracting(false);
        }
      };
      img.onerror = () => {
        setError('이미지를 불러올 수 없습니다.');
        setExtracting(false);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setError('파일을 읽을 수 없습니다.');
      setExtracting(false);
    };
    reader.readAsDataURL(file);
  };

  const applyHarmony = (mode: HarmonyMode) => {
    const base = palette?.[0] ?? '#BF877A';
    setPalette(generateHarmony(base, mode));
  };

  const applyCategory = (name: string) => {
    setPalette(CATEGORY_PALETTES[name]);
  };

  const savePalette = () => {
    if (!palette) return;
    const next = [palette, ...savedPalettes].slice(0, 12);
    setSavedPalettes(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const deleteSaved = (idx: number) => {
    const next = savedPalettes.filter((_, i) => i !== idx);
    setSavedPalettes(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const roles = palette ? assignRoles(palette) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h1 className="font-title text-xl font-bold text-text">컬러 팔레트</h1>
        <p className="text-sm text-dim">
          블로그 썸네일 이미지를 올리면 대표 색상 5가지를 추출하고, 어울리는 색상 조합·카테고리별 팔레트를 만들어드립니다.
        </p>
      </div>

      {/* 업로드 영역 */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt="업로드한 이미지" className="max-h-32 rounded-xl object-contain" />
        ) : (
          <span className="text-2xl">🖼️</span>
        )}
        <p className="text-sm font-semibold text-text">
          {extracting ? '색상 분석 중...' : '이미지를 드래그하거나 클릭해서 업로드'}
        </p>
        <p className="text-[11px] text-dim/70">JPG · PNG · WebP</p>
      </label>

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
      )}

      {palette && (
        <>
          {/* 5색 팔레트 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text">5색 팔레트</h2>
              <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
                {(['hex', 'rgb', 'hsl'] as ColorFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                      format === f ? 'bg-accent text-white' : 'text-dim hover:text-text'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {palette.map((hex, i) => {
                const key = `${hex}-${i}`;
                const value = formatColor(hex, format);
                return (
                  <button
                    key={key}
                    onClick={() => copy(value, key)}
                    className="group flex flex-col rounded-xl overflow-hidden border border-border cursor-pointer text-left"
                  >
                    <div className="h-16 sm:h-20 w-full transition-transform group-hover:scale-[1.02]" style={{ backgroundColor: hex }} />
                    <div className="bg-surface px-1.5 py-1.5 space-y-0.5">
                      <p className="text-[10px] sm:text-[11px] font-mono font-bold text-text truncate">
                        {copiedKey === key ? '복사됨!' : value}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-dim/70 truncate">{nameColor(hex)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copy(palette.join(', '), 'all')}
                className="text-[11px] font-semibold text-dim hover:text-accent transition-colors cursor-pointer"
              >
                {copiedKey === 'all' ? '전체 복사됨!' : '전체 HEX 복사'}
              </button>
              <span className="text-dim/30">·</span>
              <button
                onClick={savePalette}
                className="text-[11px] font-semibold text-dim hover:text-accent transition-colors cursor-pointer"
              >
                이 팔레트 저장
              </button>
            </div>
          </div>

          {/* 색상 조합 생성 */}
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-text">색상 조합 생성</h2>
            <p className="text-[11px] text-dim/70">현재 팔레트의 대표 색상을 기준으로 새 조합을 만듭니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {HARMONY_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => applyHarmony(mode)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-text hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  {HARMONY_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* 카테고리별 팔레트 */}
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-text">카테고리별 팔레트</h2>
            <p className="text-[11px] text-dim/70">콘텐츠 주제에 맞는 참고 팔레트로 바로 바꿔볼 수 있습니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_NAMES.map((name) => (
                <button
                  key={name}
                  onClick={() => applyCategory(name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-text hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  <span className="flex -space-x-0.5">
                    {CATEGORY_PALETTES[name].slice(0, 3).map((hex, i) => (
                      <span key={i} className="w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: hex }} />
                    ))}
                  </span>
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* 썸네일 미리보기 */}
          {roles && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-text">썸네일 스타일 미리보기</h2>
              <p className="text-[11px] text-dim/70">배경·텍스트·강조 색상을 명도·채도 기준으로 자동 배정한 참고용 미리보기입니다.</p>
              <textarea
                value={thumbTitle}
                onChange={(e) => setThumbTitle(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none"
                placeholder="썸네일에 넣을 제목"
              />
              <div
                className="rounded-2xl p-6 flex flex-col justify-between min-h-[160px] border border-border"
                style={{ backgroundColor: roles.background }}
              >
                <span
                  className="inline-block w-fit text-[11px] font-bold px-2 py-1 rounded-full mb-3"
                  style={{ backgroundColor: roles.accent, color: roles.background }}
                >
                  N인플
                </span>
                <p
                  className="font-title text-lg font-bold leading-snug whitespace-pre-line"
                  style={{ color: roles.text }}
                >
                  {thumbTitle}
                </p>
                <div className="flex gap-1.5 mt-3">
                  {(['background', 'sub', 'accent', 'text'] as const).map((r) => (
                    <span key={r} className="w-4 h-4 rounded-full border border-white/60" style={{ backgroundColor: roles[r] }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!palette && !extracting && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-text">카테고리별 팔레트로 바로 시작</h2>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => applyCategory(name)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-text hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                <span className="flex -space-x-0.5">
                  {CATEGORY_PALETTES[name].slice(0, 3).map((hex, i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: hex }} />
                  ))}
                </span>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 저장한 팔레트 */}
      {savedPalettes.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-text">저장한 팔레트</h2>
          <p className="text-[11px] text-dim/70">이 브라우저에만 저장됩니다(로그인 계정과 별개).</p>
          <div className="space-y-1.5">
            {savedPalettes.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-surface border border-border rounded-xl px-2.5 py-2">
                <button onClick={() => setPalette(p)} className="flex gap-1 cursor-pointer">
                  {p.map((hex, i) => (
                    <span key={i} className="w-6 h-6 rounded-md border border-border" style={{ backgroundColor: hex }} />
                  ))}
                </button>
                <span className="flex-1" />
                <button
                  onClick={() => deleteSaved(idx)}
                  className="text-[11px] text-dim hover:text-down transition-colors cursor-pointer"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
