/**
 * Supabase 클라이언트 SDK 호출(signInWithPassword 등)이 응답 없이 멈추면
 * 호출부의 await가 영원히 끝나지 않아 try/finally의 finally도 실행되지 않는다.
 * (middleware.ts의 withTimeout과 달리 이쪽은 UI에 에러를 보여줘야 하므로
 * fallback 반환이 아니라 타임아웃 시 reject한다.)
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} 응답이 ${ms}ms 내에 완료되지 않았습니다.`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
