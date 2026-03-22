-- Migration 014: 블로그탭 노출 기반 등급 시스템
ALTER TABLE blog_scores
  ADD COLUMN IF NOT EXISTS exposure_rate NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exposure_grade TEXT DEFAULT 'D',
  ADD COLUMN IF NOT EXISTS exposure_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stability_score INT DEFAULT 0;
