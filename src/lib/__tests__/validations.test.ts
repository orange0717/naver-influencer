import { describe, it, expect } from 'vitest';
import { signupSchema, bloggerLoginSchema, influencerLoginSchema, unifiedLoginSchema } from '../validations/auth';
import { createPostSchema, createCommentSchema, reportSchema } from '../validations/community';
import { blogKeywordSchema, blogRankQuerySchema } from '../validations/blog';
import { paymentConfirmSchema, licenseActivateSchema, licenseGenerateSchema, profileUpdateSchema, linkInfluencerSchema } from '../validations/payment';

describe('Auth 스키마', () => {
  describe('signupSchema', () => {
    it('유효한 데이터 통과', () => {
      const result = signupSchema.safeParse({
        authId: 'abc-123',
        email: 'test@example.com',
        nickname: '테스터',
      });
      expect(result.success).toBe(true);
    });

    it('이메일 형식 검증', () => {
      const result = signupSchema.safeParse({
        authId: 'abc',
        email: 'invalid',
        nickname: '테스터',
      });
      expect(result.success).toBe(false);
    });

    it('닉네임 필수', () => {
      const result = signupSchema.safeParse({
        authId: 'abc',
        email: 'test@test.com',
        nickname: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bloggerLoginSchema', () => {
    it('유효한 blogId 통과', () => {
      const result = bloggerLoginSchema.safeParse({ blogId: 'test_blog123' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.blogId).toBe('test_blog123');
      }
    });

    it('특수문자 포함 시 실패', () => {
      const result = bloggerLoginSchema.safeParse({ blogId: 'test@blog!' });
      expect(result.success).toBe(false);
    });

    it('너무 짧으면 실패', () => {
      const result = bloggerLoginSchema.safeParse({ blogId: 'a' });
      expect(result.success).toBe(false);
    });
  });

  describe('unifiedLoginSchema', () => {
    it('blogId만 있어도 통과', () => {
      const result = unifiedLoginSchema.safeParse({ blogId: 'myblog' });
      expect(result.success).toBe(true);
    });

    it('둘 다 없으면 실패', () => {
      const result = unifiedLoginSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe('Community 스키마', () => {
  describe('createPostSchema', () => {
    it('유효한 게시글 통과', () => {
      const result = createPostSchema.safeParse({
        title: '테스트 제목입니다',
        content: '테스트 내용입니다. 최소 5자 이상.',
        category: 'free',
      });
      expect(result.success).toBe(true);
    });

    it('제목이 너무 짧으면 실패', () => {
      const result = createPostSchema.safeParse({
        title: '짧',
        content: '테스트 내용입니다.',
      });
      expect(result.success).toBe(false);
    });

    it('기본 카테고리는 free', () => {
      const result = createPostSchema.safeParse({
        title: '테스트 제목입니다',
        content: '테스트 내용입니다. 최소 5자.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe('free');
      }
    });
  });

  describe('createCommentSchema', () => {
    it('유효한 댓글 통과', () => {
      const result = createCommentSchema.safeParse({ content: '좋은 글이네요!' });
      expect(result.success).toBe(true);
    });

    it('빈 댓글 실패', () => {
      const result = createCommentSchema.safeParse({ content: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('reportSchema', () => {
    it('유효한 신고 통과', () => {
      const result = reportSchema.safeParse({
        reason: 'spam',
        target_type: 'post',
      });
      expect(result.success).toBe(true);
    });

    it('잘못된 reason 실패', () => {
      const result = reportSchema.safeParse({
        reason: 'invalid',
        target_type: 'post',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Blog 스키마', () => {
  it('blogKeywordSchema 유효 데이터 통과', () => {
    const result = blogKeywordSchema.safeParse({
      blog_id: 'myblog',
      keyword: '맛집 추천',
    });
    expect(result.success).toBe(true);
  });

  it('blogRankQuerySchema 유효 데이터 통과', () => {
    const result = blogRankQuerySchema.safeParse({
      keyword: '맛집',
      blogId: 'myblog',
    });
    expect(result.success).toBe(true);
  });
});

describe('Payment 스키마', () => {
  it('paymentConfirmSchema 유효 데이터 통과', () => {
    const result = paymentConfirmSchema.safeParse({
      paymentKey: 'pk_test_abc123',
      orderId: 'NINFL_PRO_1M_user_123456',
      amount: 19800,
    });
    expect(result.success).toBe(true);
  });

  it('amount가 음수면 실패', () => {
    const result = paymentConfirmSchema.safeParse({
      paymentKey: 'pk_test_abc123',
      orderId: 'NINFL_PERSONAL_1M_user_123456',
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  it('licenseActivateSchema는 코드를 대문자로 변환', () => {
    const result = licenseActivateSchema.safeParse({ license_code: 'ninfl-abcd-efgh-ijkl' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.license_code).toBe('NINFL-ABCD-EFGH-IJKL');
    }
  });

  it('profileUpdateSchema 빈 객체 실패', () => {
    const result = profileUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('linkInfluencerSchema 유효 ID 통과', () => {
    const result = linkInfluencerSchema.safeParse({ naverId: 'test_user' });
    expect(result.success).toBe(true);
  });
});
