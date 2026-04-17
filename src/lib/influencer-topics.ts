/**
 * 네이버 인플루언서 20개 주제
 * keyword_challenges 테이블의 category 값과 일치
 */
export const INFLUENCER_TOPICS = [
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

export type InfluencerTopic = (typeof INFLUENCER_TOPICS)[number];

/**
 * URL slug ↔ 주제명 변환 (한글·슬래시가 URL에 직접 들어가지 않도록)
 */
export const TOPIC_TO_SLUG: Record<string, string> = {
  '여행': 'travel',
  '패션': 'fashion',
  '뷰티': 'beauty',
  '푸드': 'food',
  'IT테크': 'it',
  '자동차': 'car',
  '리빙': 'living',
  '육아': 'parenting',
  '생활건강': 'health',
  '게임': 'game',
  '동물/펫': 'pet',
  '운동/레저': 'leisure',
  '프로스포츠': 'sports',
  '방송/연예': 'entertainment',
  '대중음악': 'music',
  '영화': 'movie',
  '공연/전시/예술': 'art',
  '도서': 'book',
  '경제/비즈니스': 'business',
  '어학/교육': 'education',
};

export const SLUG_TO_TOPIC: Record<string, string> = Object.fromEntries(
  Object.entries(TOPIC_TO_SLUG).map(([topic, slug]) => [slug, topic]),
);

export function topicToSlug(topic: string): string | undefined {
  return TOPIC_TO_SLUG[topic];
}

export function slugToTopic(slug: string): string | undefined {
  return SLUG_TO_TOPIC[slug];
}
