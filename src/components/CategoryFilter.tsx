'use client';

import FilterPills from '@/components/analytics/FilterPills';

interface Props {
  categories: string[];
  selected: string;
  onChange: (category: string) => void;
}

export default function CategoryFilter({ categories, selected, onChange }: Props) {
  return (
    <FilterPills
      options={categories.map(cat => ({ value: cat, label: cat }))}
      value={selected}
      onChange={onChange}
    />
  );
}
