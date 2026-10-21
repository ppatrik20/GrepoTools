export { default as Button } from './Button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatCard } from './Card';
export { default as Badge } from './Badge';
export { default as Modal } from './Modal';
export { Input, Select, FormField } from './Input';
export { Skeleton, SkeletonStatGrid } from './Skeleton';
export { default as EmptyState } from './EmptyState';
export { default as PageHeader } from './PageHeader';
export { default as PageContainer } from './PageContainer';

export function formatTacticalNumber(val) {
  return new Intl.NumberFormat('en-US').format(Number(val) || 0);
}
