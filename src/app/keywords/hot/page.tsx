import { redirect } from 'next/navigation';

/** 쇼핑 카테고리 트렌드 페이지 폐지 — 키워드 검색으로 안내 */
export default function HotCategoriesRemovedRedirect() {
  redirect('/keywords/blogger');
}
