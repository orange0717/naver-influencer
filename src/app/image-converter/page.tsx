'use client';

import { useRef, useState } from 'react';

interface ConvertedFile {
  name: string;
  mimeType: string;
  blob: Blob;
}

export default function ImageConverterPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const MAX_FILES = 20;

  const parseErrorFromResponse = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        return (data?.error as string) || '변환에 실패했습니다.';
      } catch {
        return '변환에 실패했습니다.';
      }
    }
    try {
      const text = await response.text();
      return text?.slice(0, 200) || '변환에 실패했습니다.';
    } catch {
      return '변환에 실패했습니다.';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    setError(null);
    setConvertedFiles([]);
    setProgress(null);

    // 파일 개수 초과 경고
    if (files.length > MAX_FILES) {
      setShowWarning(true);
      setSelectedFiles(files.slice(0, MAX_FILES));
      return;
    }

    setShowWarning(false);
    setSelectedFiles(files);
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      setError('파일을 선택해주세요.');
      return;
    }

    setIsConverting(true);
    setError(null);
    setConvertedFiles([]);
    setProgress({ done: 0, total: selectedFiles.length });

    try {
      const out: ConvertedFile[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]!;
        setProgress({ done: i, total: selectedFiles.length });

        const formData = new FormData();
        formData.append('files', file);

        const response = await fetch('/api/tools/convert-image', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const message = await parseErrorFromResponse(response);
          setError(`${file.name}: ${message}`);
          return;
        }

        const blob = await response.blob();
        const mimeType = blob.type || response.headers.get('content-type') || 'application/octet-stream';
        const encodedName = response.headers.get('x-output-filename');
        const name = (encodedName ? decodeURIComponent(encodedName) : null) || file.name;

        out.push({ name, mimeType, blob });
        setConvertedFiles([...out]);
      }

      setProgress({ done: selectedFiles.length, total: selectedFiles.length });
    } catch (err) {
      setError('변환 중 오류가 발생했습니다. 다시 시도해주세요.');
      console.error('Conversion error:', err);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownloadAll = () => {
    convertedFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;

      // 약간의 딜레이를 두고 다운로드
      setTimeout(() => {
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, idx * 200);
    });
  };

  const handleDownloadSingle = (file: ConvertedFile, index: number) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setConvertedFiles([]);
    setError(null);
    setShowWarning(false);
    setProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="text-center pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">IMAGE TOOLS</p>
        <h1 className="font-title text-3xl md:text-4xl font-extrabold text-text mb-3">
          JPG ↔ PNG 변환기
        </h1>
        <p className="text-sm text-dim leading-relaxed">
          JPG를 PNG로, PNG를 JPG로 간편하게 변환하세요. 최대 20장까지 한 번에 처리 가능합니다.
        </p>
      </div>

      {/* 업로드 영역 */}
      <div className="bg-surface rounded-2xl border-2 border-dashed border-border p-8 text-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isConverting}
        />

        <div className="text-5xl mb-4">🖼️</div>

        {selectedFiles.length === 0 ? (
          <>
            <p className="text-base font-semibold text-text mb-2">이미지 파일을 선택하세요</p>
            <p className="text-xs text-dim mb-4">JPG 또는 PNG 파일 (최대 20장)</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isConverting}
              className="px-6 py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition disabled:opacity-50"
            >
              파일 선택
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-text mb-3">
              {selectedFiles.length}개 파일 선택됨
            </p>
            {showWarning && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700 font-semibold">
                  ⚠️ 최대 20장까지만 업로드 가능합니다. {selectedFiles.length - 20}개의 파일이 제외되었습니다.
                </p>
              </div>
            )}
            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="text-xs text-dim bg-bg/50 rounded p-2 flex justify-between items-center">
                  <span className="truncate">{file.name}</span>
                  <span className="text-[10px] ml-2 px-2 py-1 bg-accent/20 text-accent rounded">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isConverting}
                className="px-4 py-2 bg-border text-text text-sm font-bold rounded-lg hover:bg-border-hover transition disabled:opacity-50"
              >
                다른 파일 추가
              </button>
              <button
                onClick={handleReset}
                disabled={isConverting}
                className="px-4 py-2 bg-border text-text text-sm font-bold rounded-lg hover:bg-border-hover transition disabled:opacity-50"
              >
                초기화
              </button>
            </div>
          </>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-semibold">❌ {error}</p>
        </div>
      )}

      {/* 변환 버튼 */}
      {selectedFiles.length > 0 && convertedFiles.length === 0 && (
        <button
          onClick={handleConvert}
          disabled={isConverting || selectedFiles.length === 0}
          className="w-full px-6 py-3 bg-accent text-white text-base font-bold rounded-xl hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isConverting ? (
            <>
              <span className="inline-block animate-spin">⏳</span>
              변환 중...
              {progress && (
                <span className="text-sm font-semibold opacity-90">
                  ({Math.min(progress.done + 1, progress.total)}/{progress.total})
                </span>
              )}
            </>
          ) : (
            <>
              ✨ {selectedFiles.length}개 파일 변환하기
            </>
          )}
        </button>
      )}

      {/* 변환된 파일 목록 */}
      {convertedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 font-semibold">
              ✅ {convertedFiles.length}개 파일이 성공적으로 변환되었습니다!
            </p>
          </div>

          <div className="grid gap-3 max-h-60 overflow-y-auto">
            {convertedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg hover:border-accent/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">📄</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{file.name}</p>
                    <p className="text-xs text-dim">
                      {file.mimeType === 'image/png' ? 'PNG' : 'JPG'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadSingle(file, idx)}
                  className="px-3 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded hover:bg-accent hover:text-white transition whitespace-nowrap"
                >
                  다운로드
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleDownloadAll}
            className="w-full px-6 py-3 bg-accent text-white text-base font-bold rounded-xl hover:bg-accent-hover transition"
          >
            💾 전체 다운로드 ({convertedFiles.length}개)
          </button>

          <button
            onClick={handleReset}
            className="w-full px-6 py-2 bg-border text-text text-sm font-bold rounded-lg hover:bg-border-hover transition"
          >
            다시 변환하기
          </button>
        </div>
      )}

      {/* 안내 */}
      <div className="bg-bg rounded-xl p-5 space-y-3">
        <h3 className="font-bold text-text text-sm">💡 사용 팁</h3>
        <ul className="text-xs text-dim space-y-2">
          <li>• 최대 20개 파일을 동시에 변환할 수 있습니다.</li>
          <li>• JPG는 PNG로, PNG는 JPG로 자동 변환됩니다.</li>
          <li>• 높은 품질(95% 압축률)로 변환되므로 원본 이미지 손실이 최소화됩니다.</li>
          <li>• 투명 배경이 있는 PNG는 흰색 배경으로 변환됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
