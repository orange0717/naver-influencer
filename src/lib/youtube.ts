/**
 * YouTube Data API v3로 공개 지표(조회수/좋아요/댓글/길이 등)를 조회한다.
 * videoId 파싱과 자막/대본 획득은 src/lib/youtube-transcript.ts를 사용한다
 * (원래 /api/youtube/stt에 있던 로직을 공용화한 모듈).
 */

export interface YoutubeVideoMetadata {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  hasCaptions: boolean;
}

export class YoutubeApiKeyMissingError extends Error {
  constructor() {
    super('YOUTUBE_API_KEY가 설정되지 않았습니다.');
    this.name = 'YoutubeApiKeyMissingError';
  }
}

export class YoutubeVideoNotFoundError extends Error {
  constructor(videoId: string) {
    super(`영상을 찾을 수 없습니다: ${videoId}`);
    this.name = 'YoutubeVideoNotFoundError';
  }
}

/** ISO 8601 duration(PT1H2M3S)을 초 단위로 변환 */
function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

/** YouTube Data API v3 videos.list로 공개 메타데이터를 조회한다. ENV: YOUTUBE_API_KEY */
export async function fetchYoutubeVideoMetadata(videoId: string): Promise<YoutubeVideoMetadata> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new YoutubeApiKeyMissingError();

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: videoId,
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`YouTube Data API 호출 실패: ${res.status}`);
  }
  const json = await res.json();
  const item = json.items?.[0];
  if (!item) throw new YoutubeVideoNotFoundError(videoId);

  const snippet = item.snippet ?? {};
  const stats = item.statistics ?? {};
  const contentDetails = item.contentDetails ?? {};
  const thumbnails = snippet.thumbnails ?? {};
  const bestThumbnail =
    thumbnails.maxres?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? '';

  return {
    videoId,
    title: snippet.title ?? '',
    description: snippet.description ?? '',
    thumbnailUrl: bestThumbnail,
    channelTitle: snippet.channelTitle ?? '',
    publishedAt: snippet.publishedAt ?? '',
    durationSeconds: parseIsoDuration(contentDetails.duration ?? ''),
    viewCount: Number(stats.viewCount ?? 0),
    likeCount: Number(stats.likeCount ?? 0),
    commentCount: Number(stats.commentCount ?? 0),
    hasCaptions: contentDetails.caption === 'true',
  };
}

/** 초를 MM:SS(또는 H:MM:SS) 형식으로 변환 */
export function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 자막 세그먼트를 "[MM:SS] 텍스트" 줄바꿈 문자열로 합쳐 Claude 프롬프트에 넣기 쉬운 형태로 만든다. */
export function transcriptSegmentsToPromptText(
  segments: { text: string; offsetSeconds: number }[],
  maxChars = 12000,
): string {
  const lines: string[] = [];
  let total = 0;
  for (const seg of segments) {
    const line = `[${formatTimestamp(seg.offsetSeconds)}] ${seg.text}`;
    total += line.length + 1;
    if (total > maxChars) break;
    lines.push(line);
  }
  return lines.join('\n');
}
