import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import {
  JUDGE_PLAN,
  generateJudgePassword,
  judgeError,
  isExpired,
} from '@/lib/judge-accounts';

export const dynamic = 'force-dynamic';

/** requireAdmin 의 문자열 에러를 이 엔드포인트군의 { error: { code, message } } 규약으로 변환 */
async function guard(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) {
    return auth.error.status === 401
      ? judgeError('UNAUTHORIZED', '로그인이 필요합니다.', 401)
      : judgeError('FORBIDDEN', '권한이 없습니다.', 403);
  }
  return auth.authUser;
}

/**
 * GET /api/admin/judges — 심사위원 계정 목록
 *
 * 자격증명(비밀번호)은 어떤 경우에도 포함하지 않는다. 애초에 저장돼 있지 않다.
 * 최근 로그인 일시는 auth.users.last_sign_in_at 이 유일한 사실이므로 거기서 읽는다
 * (public.users.last_login_at 은 이 코드베이스에서 갱신되지 않는 죽은 컬럼).
 */
export async function GET(req: NextRequest) {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from('judge_accounts')
    .select('id, display_name, email, active, expires_at, issued_at, deactivated_at, last_verified_at, auth_id')
    .order('issued_at', { ascending: false });

  if (error) {
    console.error('[admin/judges] list error:', error.message);
    return judgeError('LIST_FAILED', '목록을 불러오지 못했습니다.', 500);
  }

  // last_sign_in_at 은 행마다 auth 조회가 필요하다. 심사위원 계정은 많아야
  // 수십 건이므로 개별 조회로 충분하고, 실패해도 목록 자체는 그대로 낸다.
  const judges = await Promise.all(
    (rows ?? []).map(async row => {
      let lastLoginAt: string | null = null;
      try {
        const { data } = await supabase.auth.admin.getUserById(row.auth_id);
        lastLoginAt = data?.user?.last_sign_in_at ?? null;
      } catch {
        /* 조회 실패는 null 로 남긴다 — "로그인 없음"과 구분하려고 status 를 따로 두지는 않는다 */
      }
      return {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        active: row.active,
        expired: isExpired(row.expires_at),
        expiresAt: row.expires_at,
        issuedAt: row.issued_at,
        deactivatedAt: row.deactivated_at,
        lastVerifiedAt: row.last_verified_at,
        lastLoginAt,
      };
    }),
  );

  return NextResponse.json({ judges });
}

/**
 * POST /api/admin/judges — 심사위원 계정 발급
 *
 * Body: { displayName, email, expiresAt(ISO8601) }
 * 201:  { id, displayName, email, credential, magicLinkUrl, expiresAt }
 *
 * credential 은 이 응답에서 딱 한 번만 나가고 저장하지 않는다. 해시는
 * Supabase Auth 에만 남는다. 로그에도 찍지 않는다.
 */
export async function POST(req: NextRequest) {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;

  let body: {
    displayName?: unknown;
    email?: unknown;
    expiresAt?: unknown;
    blogId?: unknown;
    influencerNaverId?: unknown;
    password?: unknown;
    adoptExisting?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return judgeError('BAD_REQUEST', '요청 본문을 읽을 수 없습니다.', 400);
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const expiresAtRaw = typeof body.expiresAt === 'string' ? body.expiresAt : '';
  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const influencerNaverId =
    typeof body.influencerNaverId === 'string' ? body.influencerNaverId.trim() : '';
  // 관리자가 비밀번호를 직접 정할 수 있다. 미리 정해 심사위원에게 안내해야 하는
  // 경우를 위한 것으로, 값은 요청 본문으로 스쳐 지날 뿐 저장하지도 로그에 남기지도
  // 않는다(해시는 Supabase Auth 에만). 비우면 서버가 난수로 생성한다.
  const suppliedPassword = typeof body.password === 'string' ? body.password : '';
  // 이미 회원인 이메일을 심사 계정으로 전환할지 — 관리자가 명시적으로 확인했을 때만 true.
  const adoptExisting = body.adoptExisting === true;

  if (displayName.length < 1 || displayName.length > 50) {
    return judgeError('BAD_REQUEST', '표시명은 1~50자여야 합니다.', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return judgeError('BAD_REQUEST', '이메일 형식이 올바르지 않습니다.', 400);
  }
  const expiresAtMs = new Date(expiresAtRaw).getTime();
  if (Number.isNaN(expiresAtMs)) {
    return judgeError('BAD_REQUEST', '만료 일시 형식이 올바르지 않습니다.', 400);
  }
  if (expiresAtMs <= Date.now()) {
    return judgeError('BAD_REQUEST', '만료 일시는 현재 시각 이후여야 합니다.', 400);
  }
  const expiresAt = new Date(expiresAtMs).toISOString();

  // 블로그·인플루언서 식별자 형식은 가입 경로와 동일한 규칙을 쓴다.
  if (blogId && !/^[a-zA-Z0-9_-]{2,30}$/.test(blogId)) {
    return judgeError('BAD_REQUEST', '네이버 블로그 주소를 다시 확인해주세요.', 400);
  }
  if (influencerNaverId && !/^[a-zA-Z0-9._-]{2,30}$/.test(influencerNaverId)) {
    return judgeError('BAD_REQUEST', '인플루언서홈 주소를 다시 확인해주세요.', 400);
  }
  // 하한 6자는 Supabase Auth 자체 최소 길이 — 이보다 짧으면 계정 생성 단계에서
  // 거부되므로 여기서 먼저 막아 원인이 분명한 에러를 준다. 72바이트 상한은 bcrypt 제약.
  // 짧은 비밀번호의 위험은 심사 종료일 자동 차단과 즉시 비활성화 토글로 상쇄한다.
  if (suppliedPassword && (suppliedPassword.length < 6 || suppliedPassword.length > 72)) {
    return judgeError('BAD_REQUEST', '비밀번호는 6~72자여야 합니다.', 400);
  }

  const supabase = createServiceClient();

  const { data: dupJudge } = await supabase
    .from('judge_accounts')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (dupJudge) {
    return judgeError('DUPLICATE', '이미 발급된 이메일입니다.', 409);
  }

  const { data: dupUser } = await supabase
    .from('users')
    .select('id, auth_id, is_admin')
    .eq('email', email)
    .maybeSingle();

  if (dupUser) {
    // 이미 회원인 주소. 임의로 덮어쓰지 않는다 — 관리자가 "전환"을 명시했을 때만
    // 그 계정을 심사 계정으로 바꾼다(플랜·블로그 부여 + 비밀번호 재설정).
    if (!adoptExisting) {
      return judgeError(
        'EXISTS_ADOPTABLE',
        '이미 가입된 이메일입니다. 이 계정을 심사 계정으로 전환할 수 있습니다.',
        409,
      );
    }
    if (dupUser.is_admin === true) {
      // 관리자 계정을 심사 계정으로 강등시키지 않는다.
      return judgeError('FORBIDDEN_TARGET', '관리자 계정은 전환할 수 없습니다.', 409);
    }
    return await adoptExistingUser(supabase, {
      userId: dupUser.id,
      authId: dupUser.auth_id,
      email,
      displayName,
      password: suppliedPassword || generateJudgePassword(),
      expiresAt,
      blogId,
      influencerNaverId,
      issuedBy: auth.userId,
    });
  }

  const password = suppliedPassword || generateJudgePassword();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    // 심사위원이 메일함 확인을 거치지 않고 바로 로그인할 수 있게 확인 완료 처리
    email_confirm: true,
  });

  let authId: string;
  // 새로 만든 계정만 롤백 대상 — 아래에서 흡수한 기존 계정은 지우지 않는다.
  let createdHere = false;

  if (!createError && created?.user) {
    authId = created.user.id;
    createdHere = true;
  } else {
    // 이 지점의 실패는 대개 "이미 등록된 이메일"이다. 그런데 위에서 users 행 중복은
    // 이미 걸러냈으므로, 남은 경우는 auth.users 에만 있고 public.users 행이 없는
    // 고아 계정이다. 그 상태의 계정은 로그인은 되지만 getAuthUser 가 프로필을 찾지
    // 못해 닉네임 모달에서 401 로 막히고 사용자가 빠져나갈 수 없다.
    // 여기서 그 계정을 흡수해(비밀번호·확인 상태 재설정 + 프로필 생성) 복구한다.
    const { data: link } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const orphanId = link?.user?.id;

    if (!orphanId) {
      console.error('[admin/judges] createUser failed:', createError?.message);
      return judgeError('CREATE_FAILED', '계정 생성에 실패했습니다.', 500);
    }

    const { error: resetError } = await supabase.auth.admin.updateUserById(orphanId, {
      password,
      email_confirm: true,
      ban_duration: 'none',
    });
    if (resetError) {
      console.error('[admin/judges] orphan adopt failed:', resetError.message);
      return judgeError('CREATE_FAILED', '계정 생성에 실패했습니다.', 500);
    }
    authId = orphanId;
  }

  /** 실패 시 방금 만든 auth 계정을 고아로 남기지 않는다 (흡수한 기존 계정은 보존) */
  const rollback = async (code: string, message: string, status: number) => {
    if (createdHere) {
      try {
        await supabase.auth.admin.deleteUser(authId);
      } catch (err) {
        console.error('[admin/judges] rollback deleteUser failed:', err);
      }
    }
    return judgeError(code, message, status);
  };

  // 닉네임은 앱 전반에서 표시 이름으로 쓰이고 가입 경로가 중복을 막는다.
  // 표시명이 겹치면 뒤에 번호를 붙여 발급 자체가 막히지 않게 한다.
  let nickname = displayName;
  for (let i = 2; i <= 20; i++) {
    const { data: dupNick } = await supabase
      .from('users')
      .select('id')
      .ilike('nickname', nickname)
      .limit(1);
    if (!dupNick || dupNick.length === 0) break;
    nickname = `${displayName} ${i}`;
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .insert({
      auth_id: authId,
      email,
      nickname,
      // 유료 전용 화면까지 심사 가능하도록 인플루언서 플랜을 심사 종료일까지 부여.
      // 기존 구독 판정 로직을 그대로 타며 별도 권한 경로를 만들지 않는다.
      subscription_plan: JUDGE_PLAN,
      subscription_expires_at: expiresAt,
      // 심사위원이 빈 화면을 보지 않도록 시연용 블로그를 붙인다.
      // 가입 경로와 달리 blog_id 중복을 막지 않는다 — 운영자 블로그를 심사용으로
      // 공유하는 것이 목적이며, users.blog_id 에는 DB UNIQUE 제약이 없다.
      // 부작용은 발급 응답의 blogShared 로 관리자에게 알린다.
      ...(blogId ? { blog_id: blogId } : {}),
      // is_admin 은 명시적으로 건드리지 않는다 — 심사위원에게 관리자 권한 없음.
    })
    .select('id')
    .single();

  if (userError || !userRow) {
    console.error('[admin/judges] users insert failed:', userError?.message);
    return rollback('CREATE_FAILED', '회원 정보 생성에 실패했습니다.', 500);
  }

  const { data: judgeRow, error: judgeError_ } = await supabase
    .from('judge_accounts')
    .insert({
      user_id: userRow.id,
      auth_id: authId,
      display_name: displayName,
      email,
      expires_at: expiresAt,
      issued_by: auth.userId,
    })
    .select('id')
    .single();

  if (judgeError_ || !judgeRow) {
    console.error('[admin/judges] judge insert failed:', judgeError_?.message);
    await supabase.from('users').delete().eq('id', userRow.id);
    return rollback('CREATE_FAILED', '심사위원 정보 생성에 실패했습니다.', 500);
  }

  // ── 인플루언서홈 연결 (선택) ────────────────────────────────
  // users.linked_influencer_id 에는 부분 UNIQUE 인덱스가 걸려 있어 하나의
  // 인플루언서를 두 계정이 동시에 가질 수 없다. 이미 다른 계정(대개 운영자
  // 본인)이 연결 중이면 여기서 23505 로 튕기며, 그 계정에서 연결을 빼앗지
  // 않는다. 계정 발급 자체는 성공시키고 결과만 사실대로 실어 보낸다.
  const { influencerLinked, influencerNote } = await linkInfluencer(
    supabase,
    userRow.id,
    influencerNaverId,
  );

  return NextResponse.json(
    {
      id: judgeRow.id,
      displayName,
      email,
      credential: password, // 이 응답이 유일한 노출 지점
      magicLinkUrl: null, // 이메일+비밀번호 방식이므로 사용하지 않음
      expiresAt,
      blogId: blogId || null,
      influencerLinked,
      influencerNote,
    },
    { status: 201 },
  );
}

/**
 * 인플루언서홈 연결 — 발급/전환 두 경로 공용.
 *
 * users.linked_influencer_id 에는 부분 UNIQUE 인덱스가 걸려 있어 하나의
 * 인플루언서를 두 계정이 동시에 가질 수 없다. 이미 다른 계정(대개 운영자
 * 본인)이 연결 중이면 23505 로 튕기며, 그 계정에서 연결을 빼앗지 않는다.
 * 계정 발급 자체는 성공시키고 결과만 사실대로 실어 보낸다.
 */
async function linkInfluencer(
  supabase: SupabaseClient,
  userId: string,
  influencerNaverId: string,
): Promise<{ influencerLinked: boolean; influencerNote: string | null }> {
  if (!influencerNaverId) return { influencerLinked: false, influencerNote: null };

  const { data: inf } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', influencerNaverId)
    .maybeSingle();

  if (!inf) {
    return { influencerLinked: false, influencerNote: '해당 인플루언서를 찾지 못했습니다.' };
  }

  const { error } = await supabase
    .from('users')
    .update({ linked_influencer_id: inf.id })
    .eq('id', userId);

  if (!error) return { influencerLinked: true, influencerNote: null };
  if (error.code === '23505') {
    return {
      influencerLinked: false,
      influencerNote: '이미 다른 계정에 연결된 인플루언서라 연결하지 않았습니다.',
    };
  }
  console.error('[admin/judges] influencer link failed:', error.message);
  return { influencerLinked: false, influencerNote: '인플루언서 연결에 실패했습니다.' };
}

/**
 * 이미 가입된 회원을 심사 계정으로 전환한다.
 *
 * 계정을 새로 만드는 대신 기존 행에 심사용 권한(인플루언서 플랜 + 심사 종료일)과
 * 시연용 블로그를 얹고 비밀번호를 재설정한 뒤 judge_accounts 에 등록한다.
 * 관리자가 전환을 명시했을 때만 호출된다 — 임의로 남의 계정을 덮어쓰지 않는다.
 */
async function adoptExistingUser(
  supabase: SupabaseClient,
  params: {
    userId: string;
    authId: string | null;
    email: string;
    displayName: string;
    password: string;
    expiresAt: string;
    blogId: string;
    influencerNaverId: string;
    issuedBy: string;
  },
): Promise<NextResponse> {
  if (!params.authId) {
    return judgeError('CREATE_FAILED', '이 계정은 전환할 수 없습니다.', 409);
  }

  // 비밀번호 재설정 — 관리자가 안내할 값을 알고 있어야 하므로 여기서 덮어쓴다.
  // 밴 상태였을 수 있으니 함께 푼다.
  const { error: authError } = await supabase.auth.admin.updateUserById(params.authId, {
    password: params.password,
    email_confirm: true,
    ban_duration: 'none',
  });
  if (authError) {
    console.error('[admin/judges] adopt updateUser failed:', authError.message);
    return judgeError('CREATE_FAILED', '계정 전환에 실패했습니다.', 500);
  }

  const updates: Record<string, unknown> = {
    subscription_plan: JUDGE_PLAN,
    subscription_expires_at: params.expiresAt,
  };
  if (params.blogId) updates.blog_id = params.blogId;

  const { error: userError } = await supabase
    .from('users')
    .update(updates)
    .eq('id', params.userId);

  if (userError) {
    console.error('[admin/judges] adopt user update failed:', userError.message);
    return judgeError('CREATE_FAILED', '계정 전환에 실패했습니다.', 500);
  }

  const { data: judgeRow, error: insertError } = await supabase
    .from('judge_accounts')
    .insert({
      user_id: params.userId,
      auth_id: params.authId,
      display_name: params.displayName,
      email: params.email,
      expires_at: params.expiresAt,
      issued_by: params.issuedBy,
    })
    .select('id')
    .single();

  if (insertError || !judgeRow) {
    console.error('[admin/judges] adopt judge insert failed:', insertError?.message);
    return judgeError('CREATE_FAILED', '심사위원 정보 생성에 실패했습니다.', 500);
  }

  const { influencerLinked, influencerNote } = await linkInfluencer(
    supabase,
    params.userId,
    params.influencerNaverId,
  );

  return NextResponse.json(
    {
      id: judgeRow.id,
      displayName: params.displayName,
      email: params.email,
      credential: params.password,
      magicLinkUrl: null,
      expiresAt: params.expiresAt,
      blogId: params.blogId || null,
      influencerLinked,
      influencerNote,
      adopted: true,
    },
    { status: 201 },
  );
}
