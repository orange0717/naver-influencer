import { Redis } from '@upstash/redis';

// Upstash Redis 공유 캐시. 환경변수 없으면 인메모리 Map으로 폴백(로컬 개발용).
// rate-limit.ts와 동일한 hasRedis 게이트 패턴을 따른다.

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = hasRedis ? Redis.fromEnv() : null;

// 인메모리 폴백 저장소 (prefix 무관 단일 Map, 만료 시각 보관)
const mem = new Map<string, { value: unknown; expires: number }>();
const MEM_MAX = 1000;

function memCleanup() {
  const now = Date.now();
  for (const [k, v] of mem) if (v.expires < now) mem.delete(k);
  if (mem.size > MEM_MAX) {
    const oldest = [...mem.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < oldest.length - MEM_MAX; i++) mem.delete(oldest[i][0]);
  }
}

/**
 * 공유 캐시 조회. 미스면 null.
 * @param key  네임스페이스 포함 키 (예: "rank:맛집")
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      const v = await redis.get<T>(key); // Upstash가 JSON 자동 역직렬화
      return v ?? null;
    } catch {
      return null; // Redis 장애 시 캐시 미스로 처리 (스크래핑 폴백)
    }
  }
  const hit = mem.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  return null;
}

/**
 * 공유 캐시 저장.
 * @param ttlSeconds 만료 시간(초)
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch {
      /* Redis 장애 시 저장 생략 */
    }
    return;
  }
  if (mem.size + 1 > MEM_MAX) memCleanup();
  mem.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}
