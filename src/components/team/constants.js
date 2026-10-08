import React from 'react';
import {
  Shield, Swords, Radar, Handshake, Crosshair,
  Flag, Crown, Flame, Compass, Anchor
} from 'lucide-react';

export const AVAILABLE_ICONS = [
  { id: 'shield', label: 'Shield', icon: Shield },
  { id: 'swords', label: 'Swords', icon: Swords },
  { id: 'radar', label: 'Radar', icon: Radar },
  { id: 'handshake', label: 'Diplomacy', icon: Handshake },
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair },
  { id: 'flag', label: 'Banner', icon: Flag },
  { id: 'crown', label: 'Crown', icon: Crown },
  { id: 'flame', label: 'Flame', icon: Flame },
  { id: 'compass', label: 'Compass', icon: Compass },
  { id: 'anchor', label: 'Naval Anchor', icon: Anchor }
];

export const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#64748B'  // Slate
];

export function getRoleIcon(iconName, size = 16, className = '') {
  const matched = AVAILABLE_ICONS.find(i => i.id === iconName);
  const IconComp = matched ? matched.icon : Shield;
  return <IconComp size={size} className={className} />;
}
