import { redirect } from 'next/navigation';

/** 카테고리별 핫 키워드 페이지 폐지 — 키워드 검색으로 안내 */
export default function HotCategoryRemovedRedirect() {
  redirect('/keywords/blogger');
}
