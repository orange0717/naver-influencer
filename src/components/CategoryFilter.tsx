'use client';

interface Props {
  categories: string[];
  selected: string;
  onChange: (category: string) => void;
  size?: 'sm' | 'md';
}

export default function CategoryFilter({ categories, selected, onChange, size = 'md' }: Props) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`px-3 py-1.5 rounded-lg ${textSize} font-semibold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40 ${
            selected === cat
              ? 'bg-accent text-white'
              : 'bg-surface border border-border text-dim hover:border-accent/40'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
