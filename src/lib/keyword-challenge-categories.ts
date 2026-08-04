import { z } from 'zod';

/**
 * 키워드챌린지 / 인플루언서 주제 — DB `keyword_challenges.category`·`influencers.my_keyword_category` 와 동일한 문자열을 써야 합니다.
 * (인플 목록 API `src/app/api/influencers/route.ts` 와 동기)
 */
export const KEYWORD_CHALLENGE_CATEGORIES = [
  '여행',
  '패션',
  '뷰티',
  '푸드',
  'IT테크',
  '자동차',
  '리빙',
  '육아',
  '생활건강',
  '게임',
  '동물/펫',
  '운동/레저',
  '프로스포츠',
  '방송/연예',
  '대중음악',
  '영화',
  '공연/전시/예술',
  '도서',
  '경제/비즈니스',
  '어학/교육',
] as const;

export const keywordChallengeCategorySchema = z.enum(KEYWORD_CHALLENGE_CATEGORIES);
