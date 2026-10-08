import { describe, test, expect } from 'vitest';
import * as UI from '../../src/components/ui/index.js';
import Button from '../../src/components/ui/Button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatCard } from '../../src/components/ui/Card.jsx';
import Badge from '../../src/components/ui/Badge.jsx';
import Modal from '../../src/components/ui/Modal.jsx';
import { Input, Select, FormField } from '../../src/components/ui/Input.jsx';
import { Skeleton, SkeletonStatGrid } from '../../src/components/ui/Skeleton.jsx';
import EmptyState from '../../src/components/ui/EmptyState.jsx';
import PageHeader from '../../src/components/ui/PageHeader.jsx';

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
});
