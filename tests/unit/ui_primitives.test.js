import { describe, test, expect } from 'vitest';
import React from 'react';
import * as UI from '../../src/components/ui/index.js';
import Button from '../../src/components/ui/Button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatCard } from '../../src/components/ui/Card.jsx';
import Badge from '../../src/components/ui/Badge.jsx';
import Modal from '../../src/components/ui/Modal.jsx';
import { Input, Select, FormField } from '../../src/components/ui/Input.jsx';
import { Skeleton, SkeletonStatGrid } from '../../src/components/ui/Skeleton.jsx';
import EmptyState from '../../src/components/ui/EmptyState.jsx';
import PageHeader from '../../src/components/ui/PageHeader.jsx';
import PageContainer from '../../src/components/ui/PageContainer.jsx';
import {
  MapOverlayStorageAdapter,
  loadCoalitionsAndColors,
  saveCoalitionsAndColors
} from '../../src/lib/map/MapOverlayStorageAdapter.js';

describe('UI Primitives Design System Component Suite', () => {
  test('barrel export exposes all atomic and compound primitives', () => {
    expect(UI.Button).toBeDefined();
    expect(UI.Card).toBeDefined();
    expect(UI.CardHeader).toBeDefined();
    expect(UI.CardTitle).toBeDefined();
    expect(UI.CardDescription).toBeDefined();
    expect(UI.CardContent).toBeDefined();
    expect(UI.CardFooter).toBeDefined();
    expect(UI.StatCard).toBeDefined();
    expect(UI.Badge).toBeDefined();
    expect(UI.Modal).toBeDefined();
    expect(UI.Input).toBeDefined();
    expect(UI.Select).toBeDefined();
    expect(UI.FormField).toBeDefined();
    expect(UI.Skeleton).toBeDefined();
    expect(UI.SkeletonStatGrid).toBeDefined();
    expect(UI.EmptyState).toBeDefined();
    expect(UI.PageHeader).toBeDefined();
    expect(UI.PageContainer).toBeDefined();
    expect(UI.formatTacticalNumber).toBeDefined();
  });

  test('formatTacticalNumber formats numbers using en-US locale', () => {
    expect(UI.formatTacticalNumber(1234567)).toBe('1,234,567');
    expect(UI.formatTacticalNumber(null)).toBe('0');
    expect(UI.formatTacticalNumber('42000')).toBe('42,000');
  });

  test('PageContainer renders responsive console wrapper', () => {
    expect(typeof PageContainer).toBe('function');
    const element = PageContainer({ className: 'custom-class', children: 'Content' });
    expect(element.props.className).toContain('max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6');
    expect(element.props.className).toContain('custom-class');
  });

  test('Input with icon uses pl-3.5 icon container and pl-10 pr-3.5 input padding (VIS-01)', () => {
    const DummyIcon = () => null;
    const wrapper = Input({ icon: DummyIcon, placeholder: 'Search...' });
    const [iconWrapper, inputEl] = React.Children.toArray(wrapper.props.children);
    expect(iconWrapper.props.className).toContain('pl-3.5');
    expect(inputEl.props.className).toContain('pl-10 pr-3.5');
  });

  test('Button is a function component with polymorphic props', () => {
    expect(typeof Button).toBe('function');
  });

  test('Card compound components are valid function components', () => {
    expect(typeof Card).toBe('function');
    expect(typeof CardHeader).toBe('function');
    expect(typeof CardTitle).toBe('function');
    expect(typeof CardDescription).toBe('function');
    expect(typeof CardContent).toBe('function');
    expect(typeof CardFooter).toBe('function');
    expect(typeof StatCard).toBe('function');
  });

  test('Badge component is a valid function component', () => {
    expect(typeof Badge).toBe('function');
  });

  test('Modal component is a valid function component', () => {
    expect(typeof Modal).toBe('function');
  });

  test('Form primitives are valid function components', () => {
    expect(typeof Input).toBe('function');
    expect(typeof Select).toBe('function');
    expect(typeof FormField).toBe('function');
  });

  test('Skeleton & EmptyState primitives are valid function components', () => {
    expect(typeof Skeleton).toBe('function');
    expect(typeof SkeletonStatGrid).toBe('function');
    expect(typeof EmptyState).toBe('function');
    expect(typeof PageHeader).toBe('function');
  });

  test('MapOverlayStorageAdapter loads and saves coalitions with customColors fallback', async () => {
    const store = new Map();
    const mockStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    };
    const mockCoalitions = [
      { id: 'c1', name: 'Hellenic League', color: '#10b981', alliances: ['Sparta', { name: 'Athens' }] }
    ];

    const savedColors = await saveCoalitionsAndColors('hu119', mockCoalitions, {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ success: true, coalitions: mockCoalitions })
      }),
      storage: mockStorage
    });

    expect(savedColors['Sparta']).toBe('#10b981');
    expect(savedColors['Athens']).toBe('#10b981');
    expect(savedColors['Hellenic League']).toBe('#10b981');

    // Fallback to localStorage when fetch rejects
    const loaded = await loadCoalitionsAndColors('hu119', {
      fetchImpl: async () => { throw new Error('Offline'); },
      storage: mockStorage
    });
    expect(loaded.coalitions).toHaveLength(1);
    expect(loaded.customColors['Sparta']).toBe('#10b981');
    expect(typeof MapOverlayStorageAdapter.getTacticalPins).toBe('function');
    expect(typeof MapOverlayStorageAdapter.deleteTacticalPin).toBe('function');
  });
});
