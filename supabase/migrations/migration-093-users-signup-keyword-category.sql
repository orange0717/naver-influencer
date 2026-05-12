-- 가입 시 선택한 키워드챌린지 주제. 인플루언서 본인 연결(/api/my/link) 시 influencers.my_keyword_category 로 반영.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_keyword_category text;

COMMENT ON COLUMN public.users.signup_keyword_category IS '회원가입 시 선택한 챌린지 주제(도서·경제/비즈니스 등). 인플 연결 시 my_keyword_category 로 복사.';
