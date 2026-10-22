import {
  Baby,
  Banknote,
  Car,
  CircleDot,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Plane,
  Shield,
  ShoppingCart,
  Smartphone,
  User,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Category, CategoryColor, CategoryIcon } from '../state/types';

export const ICONS: Record<CategoryIcon, LucideIcon> = {
  home: House,
  zap: Zap,
  cart: ShoppingCart,
  car: Car,
  health: HeartPulse,
  dining: Utensils,
  personal: User,
  savings: PiggyBank,
  other: CircleDot,
  paycheck: Banknote,
  gift: Gift,
  phone: Smartphone,
  shield: Shield,
  kids: Baby,
  pet: PawPrint,
  fun: PartyPopper,
  education: GraduationCap,
  travel: Plane,
};

export function CategoryBadge({
  category,
  size = 'md',
}: {
  category: Pick<Category, 'icon' | 'color'> | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const Icon = ICONS[category?.icon ?? 'other'] ?? CircleDot;
  return (
    <span className={`cat-badge cat-badge--${size}`} data-color={category?.color ?? 'slate'} aria-hidden="true">
      <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} strokeWidth={2} />
    </span>
  );
}

export function Swatch({ color }: { color: CategoryColor }) {
  return <span className="swatch" data-color={color} aria-hidden="true" />;
}
