/**
 * 네이버 쇼핑 1차 카테고리 공용 상수
 * 블로거 타깃과 무관한 면세점은 제외
 */
export interface ShoppingCategory {
  name: string;
  code: string;
}

export const SHOPPING_CATEGORIES: ShoppingCategory[] = [
  { name: '패션의류', code: '50000000' },
  { name: '패션잡화', code: '50000001' },
  { name: '화장품/미용', code: '50000002' },
  { name: '디지털/가전', code: '50000003' },
  { name: '가구/인테리어', code: '50000004' },
  { name: '출산/육아', code: '50000005' },
  { name: '식품', code: '50000006' },
  { name: '스포츠/레저', code: '50000007' },
  { name: '생활/건강', code: '50000008' },
  { name: '여가/생활편의', code: '50000009' },
  { name: '도서', code: '50005542' },
];

export function findCategoryByCode(code: string): ShoppingCategory | undefined {
  return SHOPPING_CATEGORIES.find(c => c.code === code);
}

export function findCategoryByName(name: string): ShoppingCategory | undefined {
  return SHOPPING_CATEGORIES.find(c => c.name === name);
}
