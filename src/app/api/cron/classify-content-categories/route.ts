import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU, parseJsonArrayFromClaudeText, parseJsonObjectFromClaudeText } from '@/lib/claude-client';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:classify-content-categories';
const CRON_LOCK_TTL_SECONDS = 660;
const TIME_BUDGET_MS = 270_000;
// 유저당 이번 실행에서 처리할 미분류 글 캡 — 대형 블로그도 며칠에 걸쳐 점진적으로 백필된다.
const PER_USER_CAP = 60;
const BATCH_SIZE = 20;
// 대분류가 이 개수 이상 쌓이고 아직 소분류가 없으면 자동 세분화를 시도한다.
const SPLIT_THRESHOLD = 15;
// 세분화를 이미 한 번 시도했던 대분류는, 글 수가 마지막 체크 대비 30% 이상 늘어야 재시도한다.
const SPLIT_GROWTH_RATIO = 1.3;
const SPLIT_SAMPLE_CAP = 40;

type SupabaseClient = ReturnType<typeof createServiceClient>;

interface RootAssignment {
  index: number;
  rootName: string;
  isNewRoot: boolean;
  childName: string | null;
}

interface SplitChild {
  name: string;
  postIndices: number[];
}

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTree(roots: { id: string; name: string }[], childrenByParent: Map<string, { id: string; name: string }[]>): string {
  if (roots.length === 0) return '(없음)';
  return roots
    .map(r => {
      const kids = childrenByParent.get(r.id) || [];
      return kids.length ? `${r.name}(하위: ${kids.map(k => k.name).join(', ')})` : r.name;
    })
    .join(', ');
}

/** 활성 INFLUENCER 플랜 유저 id 집합 — curate-blog-topics와 동일한 대상 조건 */
async function resolveActiveInfluencerUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, subscription_plan, subscription_expires_at')
    .eq('subscription_plan', 'INFLUENCER');
  if (error) throw error;
  const now = Date.now();
  return new Set(
    (users || [])
      .filter(u => u.subscription_expires_at && new Date(u.subscription_expires_at).getTime() > now)
      .map(u => u.id as string),
  );
}

/**
 * 기존 카테고리를 캐시에서 찾거나, 없으면 생성한다. upsert 대신 select-then-insert를 쓰는 이유:
 * content_categories의 유니크 제약이 parent_id IS NULL 여부로 나뉜 부분 유니크 인덱스라
 * PostgREST upsert의 onConflict가 predicate를 지정할 수 없어 매칭되지 않는다.
 */
async function getOrCreateCategory(
  supabase: SupabaseClient,
  cache: Map<string, string>,
  params: { userId: string; blogId: string; parentId: string | null; name: string },
): Promise<string> {
  const key = `${params.parentId ?? 'root'}::${params.name}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const select = () => {
    let q = supabase
      .from('content_categories')
      .select('id')
      .eq('user_id', params.userId)
      .eq('blog_id', params.blogId)
      .eq('name', params.name);
    q = params.parentId ? q.eq('parent_id', params.parentId) : q.is('parent_id', null);
    return q.maybeSingle();
  };

  const { data: existing } = await select();
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('content_categories')
    .insert({ user_id: params.userId, blog_id: params.blogId, parent_id: params.parentId, name: params.name })
    .select('id')
    .single();

  if (error || !created) {
    // 동시성 레이스로 유니크 제약에 걸린 경우 재조회
    const { data: retry } = await select();
    if (retry) {
      cache.set(key, retry.id);
      return retry.id;
    }
    throw error || new Error('카테고리 생성 실패');
  }

  cache.set(key, created.id);
  return created.id;
}

async function classifyRootBatch(
  anthropic: Anthropic,
  treeText: string,
  posts: { title: string; excerpt: string; category?: string | null }[],
): Promise<RootAssignment[] | null> {
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 1500,
      system: `당신은 네이버 블로그 글을 대분류(주제 카테고리)로 분류하는 분석가입니다.
크리에이터의 콘텐츠 자산을 "AI", "맛집", "여행", "육아", "책", "보험" 같은 짧은 한국어 명사 대분류로 나눕니다.

기존 대분류 트리가 주어지면, 가능한 한 기존 대분류(및 그 하위 소분류)에 배정하세요.
정말 기존 어느 것과도 맞지 않을 때만 새 대분류명을 제안하세요(대분류 난립 방지를 위해 최대한 재사용, 오타·띄어쓰기 차이만 있어도 기존 것으로 취급).
소분류는 이미 존재하는 것에만 배정할 수 있고, 새 소분류를 만들지는 마세요(별도 단계에서 자동 세분화됩니다).

아래 JSON 배열만 반환하세요 (코드블록, 설명 없이 순수 JSON):
[{ "index": 0, "rootName": "대분류명", "isNewRoot": false, "childName": "기존 소분류명 또는 null" }]

규칙:
- rootName은 짧은 한국어 명사(2~6자 권장)
- childName은 rootName이 기존 대분류이고 그 하위에 실제로 맞는 기존 소분류가 있을 때만, 없으면 null
- isNewRoot=true면 childName은 항상 null
- 모든 글에 대해 반드시 하나씩 응답할 것(순서/개수 그대로)`,
      messages: [
        {
          role: 'user',
          content: `기존 대분류 트리: ${treeText}\n\n분류할 글 목록:\n${posts
            .map((p, i) => `[${i}] 제목: ${p.title}\n네이버 카테고리: ${p.category || '(없음)'}\n본문 발췌: ${p.excerpt}`)
            .join('\n\n')}`,
        },
      ],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const parsed = parseJsonArrayFromClaudeText<Partial<RootAssignment>[]>(rawText);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter((p): p is RootAssignment => typeof p.index === 'number' && typeof p.rootName === 'string' && p.rootName.trim().length > 0)
      .map(p => ({ index: p.index, rootName: normalizeCategoryName(p.rootName), isNewRoot: !!p.isNewRoot, childName: p.childName || null }));
  } catch (err) {
    console.error('[classify-content-categories] classifyRootBatch error:', err);
    return null;
  }
}

async function splitCategory(
  anthropic: Anthropic,
  rootName: string,
  posts: { title: string; excerpt: string }[],
): Promise<SplitChild[] | null> {
  if (posts.length === 0) return null;
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 1000,
      system: `당신은 네이버 블로그의 한 대분류에 속한 글들을 의미 단위 소분류로 세분화하는 분석가입니다.
주어진 대분류(예: "AI") 아래 글들을 2~5개의 소분류(예: "ChatGPT", "Gemini", "Claude", "AI검색", "프롬프트")로 나누세요.

아래 JSON만 반환하세요 (코드블록, 설명 없이 순수 JSON):
{ "children": [ { "name": "소분류명", "postIndices": [0, 2, 5] } ] }

규칙:
- 소분류명은 짧은 한국어 명사(브랜드/제품/세부 주제 등)
- 모든 글을 억지로 소분류에 넣지 않아도 됨 — 애매한 글은 어느 postIndices에도 넣지 말 것(대분류 직속으로 남습니다)
- 의미 있게 나뉘지 않으면(글들이 사실상 한 덩어리면) children을 빈 배열로 반환`,
      messages: [
        {
          role: 'user',
          content: `대분류: ${rootName}\n\n글 목록:\n${posts.map((p, i) => `[${i}] 제목: ${p.title}\n본문 발췌: ${p.excerpt}`).join('\n\n')}`,
        },
      ],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const parsed = parseJsonObjectFromClaudeText<{ children?: Partial<SplitChild>[] }>(rawText);
    const children = Array.isArray(parsed.children) ? parsed.children : [];
    return children
      .filter((c): c is SplitChild => !!c && typeof c.name === 'string' && Array.isArray(c.postIndices))
      .map(c => ({ name: normalizeCategoryName(c.name), postIndices: c.postIndices }));
  } catch (err) {
    console.error('[classify-content-categories] splitCategory error:', err);
    return null;
  }
}

async function trySplitOversizedRoots(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
  blogId: string,
  cache: Map<string, string>,
): Promise<void> {
  const { data: roots } = await supabase
    .from('content_categories')
    .select('id, name, last_split_checked_at, last_split_checked_count')
    .eq('user_id', userId)
    .eq('blog_id', blogId)
    .is('parent_id', null);

  for (const root of roots || []) {
    const { data: childRows } = await supabase.from('content_categories').select('id').eq('parent_id', root.id).limit(1);
    if (childRows && childRows.length > 0) continue; // 이미 세분화됨

    const { count } = await supabase
      .from('blog_post_contents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category_id', root.id);
    const postCount = count || 0;
    if (postCount < SPLIT_THRESHOLD) continue;

    const alreadyChecked = root.last_split_checked_at != null;
    const grown = alreadyChecked && root.last_split_checked_count != null && postCount >= root.last_split_checked_count * SPLIT_GROWTH_RATIO;
    if (alreadyChecked && !grown) continue;

    const { data: posts } = await supabase
      .from('blog_post_contents')
      .select('id, title, content_excerpt')
      .eq('user_id', userId)
      .eq('category_id', root.id)
      .limit(SPLIT_SAMPLE_CAP);

    const samplePosts = posts || [];
    const children = await splitCategory(
      anthropic,
      root.name,
      samplePosts.map(p => ({ title: p.title || '', excerpt: (p.content_excerpt || '').slice(0, 300) })),
    );

    if (children && children.length >= 2) {
      for (const child of children) {
        const postIds = child.postIndices.map(i => samplePosts[i]?.id).filter((id): id is string => !!id);
        if (postIds.length === 0) continue;
        const childId = await getOrCreateCategory(supabase, cache, { userId, blogId, parentId: root.id, name: child.name });
        await supabase.from('blog_post_contents').update({ category_id: childId }).in('id', postIds);
      }
    }

    await supabase
      .from('content_categories')
      .update({ last_split_checked_at: new Date().toISOString(), last_split_checked_count: postCount })
      .eq('id', root.id);
  }
}

/**
 * 매일 자동 실행 — curate-blog-topics가 채워둔 blog_post_contents 중 아직 대분류가 없는 글을
 * 증분 분류해 계정 생성 이후 전체 발행 이력을 점진적으로 대분류/소분류 트리로 누적한다.
 * GET /api/cron/classify-content-categories
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let anthropic: Anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('classify-content-categories');
  const supabase = createServiceClient();

  let totalUsers = 0;
  let totalClassified = 0;
  let totalFailed = 0;

  try {
    const activeUserIds = await resolveActiveInfluencerUserIds(supabase);

    let targets: { userId: string; blogId: string }[] = [];
    if (activeUserIds.size > 0) {
      const { data: unclassifiedRows } = await supabase
        .from('blog_post_contents')
        .select('user_id, blog_id')
        .is('category_id', null)
        .in('user_id', Array.from(activeUserIds));

      const seen = new Set<string>();
      for (const row of unclassifiedRows || []) {
        const key = `${row.user_id}::${row.blog_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ userId: row.user_id, blogId: row.blog_id });
      }
      targets = shuffle(targets);
    }

    for (const { userId, blogId } of targets) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      totalUsers++;

      try {
        const { data: existingCats } = await supabase
          .from('content_categories')
          .select('id, parent_id, name')
          .eq('user_id', userId)
          .eq('blog_id', blogId);

        const cache = new Map<string, string>();
        const roots: { id: string; name: string }[] = [];
        const childrenByParent = new Map<string, { id: string; name: string }[]>();
        for (const c of existingCats || []) {
          cache.set(`${c.parent_id ?? 'root'}::${normalizeCategoryName(c.name)}`, c.id);
          if (!c.parent_id) {
            roots.push({ id: c.id, name: c.name });
          } else {
            const arr = childrenByParent.get(c.parent_id) || [];
            arr.push({ id: c.id, name: c.name });
            childrenByParent.set(c.parent_id, arr);
          }
        }
        const treeText = formatTree(roots, childrenByParent);

        const { data: unclassified } = await supabase
          .from('blog_post_contents')
          .select('id, title, content_excerpt, category, published_at')
          .eq('user_id', userId)
          .eq('blog_id', blogId)
          .is('category_id', null)
          .limit(PER_USER_CAP);

        const posts = unclassified || [];
        for (let i = 0; i < posts.length; i += BATCH_SIZE) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) break;
          const batch = posts.slice(i, i + BATCH_SIZE);
          const assignments = await classifyRootBatch(
            anthropic,
            treeText,
            batch.map(p => ({ title: p.title || '', excerpt: (p.content_excerpt || '').slice(0, 300), category: p.category })),
          );

          if (!assignments) {
            totalFailed += batch.length;
            await sleep(300);
            continue;
          }

          for (const a of assignments) {
            const row = batch[a.index];
            if (!row) continue;
            try {
              const rootId = await getOrCreateCategory(supabase, cache, { userId, blogId, parentId: null, name: a.rootName });
              if (!roots.some(r => r.id === rootId)) roots.push({ id: rootId, name: a.rootName });

              let categoryId = rootId;
              if (!a.isNewRoot && a.childName) {
                const childId = cache.get(`${rootId}::${normalizeCategoryName(a.childName)}`);
                if (childId) categoryId = childId;
              }

              const parsedDate = row.published_at ? parseNaverPostDate(row.published_at) : null;
              const publishedYear = parsedDate ? new Date(parsedDate).getUTCFullYear() : null;

              await supabase.from('blog_post_contents').update({ category_id: categoryId, published_year: publishedYear }).eq('id', row.id);
              totalClassified++;
            } catch (assignErr) {
              totalFailed++;
              console.error(`[classify-content-categories] assign post ${row.id} failed:`, assignErr);
            }
          }
          await sleep(300);
        }

        if (Date.now() - startedAt < TIME_BUDGET_MS) {
          await trySplitOversizedRoots(supabase, anthropic, userId, blogId, cache);
        }
      } catch (userErr) {
        totalFailed++;
        console.error(`[classify-content-categories] user ${userId} (${blogId}) failed:`, userErr);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalUsers,
      processed_items: totalClassified,
      failed_items: totalFailed,
    });

    return NextResponse.json({ success: true, users: totalUsers, classified: totalClassified, failed: totalFailed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[classify-content-categories] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
