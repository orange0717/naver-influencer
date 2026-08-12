import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local build / tooling output (not application source)
    ".vercel/**",
    "backend/.venv/**",
    // 별도 런타임/빌드 컨텍스트 — Next 앱(브라우저/ESM) 규칙 대상이 아니다.
    // (require()/CommonJS가 정상인 곳이라 앱 eslint로 린트하면 오탐만 난다)
    "frontend/**",        // 별개 Vite 앱(ninfl-ranking-web, 자체 tsconfig/eslint)
    "chrome-extension/**", // 브라우저 확장(별도 번들)
    "desktop/**",         // Electron 메인/프리로드(CommonJS)
    "scripts/**",         // Node 운영/빌드 스크립트(CommonJS/mjs)
    "worker/**",          // Cloudflare Worker
  ]),
  {
    // React Compiler(babel-plugin-react-compiler)는 이 프로젝트에서 미사용(next.config에 reactCompiler 설정 없음).
    // eslint-plugin-react-hooks v7이 함께 들여온 React Compiler 계열 규칙은 "최적화 advisory"라, 기존 정상
    // 코드(특히 서버 컴포넌트의 Date.now()/new Date() 같은 요청당 렌더 관용구)에도 다수 오탐을 낸다.
    // 30여 곳을 무작정 이펙트/렌더 재구조화하면 유료화 직전에 회귀 위험이 크므로, error가 아니라 warn으로
    // 두어 계속 노출(숨기지 않음)하되 빌드/CI를 막지 않게 한다. 점진적으로 실제 개선 대상만 손본다.
    rules: {
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]);

export default eslintConfig;
