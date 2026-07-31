interface LoadingSpinnerProps {
  /** 스피너 크기 (기본: md = w-5 h-5) */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** border 색상 클래스 (기본: 기존 코드베이스에서 가장 흔히 쓰인 accent 톤) */
  color?: string;
  /** 추가 커스터마이징용 className (mx-auto, mb-3 등) */
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

// 기존 코드베이스 전반에서 가장 흔히 쓰이던 패턴: border-2 border-accent/30 border-t-accent rounded-full
const DEFAULT_COLOR_CLASSES = 'border-accent/30 border-t-accent';

export default function LoadingSpinner({ size = 'md', color = DEFAULT_COLOR_CLASSES, className = '' }: LoadingSpinnerProps) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 ${SIZE_CLASSES[size]} ${color} ${className}`.trim()}
    />
  );
}
