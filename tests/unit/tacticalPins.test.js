import { expect, test, describe, beforeEach } from 'vitest';
import { 
  getTacticalPins, 
  saveTacticalPin, 
  removeTacticalPin, 
  exportPinToSniper, 
  exportPinToPlanner,
  PIN_TYPES,
  PIN_PRIORITIES
} from '../../src/lib/map/tacticalPins.js';

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, val) {
    this.store.set(key, String(val));
  }
  removeItem(key) {
    this.store.delete(key);
  }
}

describe('Milestone 4: Tactical Alliance Pinboard & Operations Unit Tests', () => {
  let storage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  describe('Storage & CRUD Operations', () => {
    test('saves and retrieves tactical pins with defaults and sanitized data', () => {
      const pin = {
        townId: 101,
        townName: 'Sparta Alpha',
        townX: 520,
        townY: 530,
        type: 'PRIMARY_TARGET',
        priority: 'CRITICAL',
        notes: 'Land colony ship at 12:00:00. Bireme stack required.'
      };

      const pins = saveTacticalPin('en123', pin, storage);
      expect(pins).toHaveLength(1);
      expect(pins[0].id).toBeDefined();
      expect(pins[0].townId).toBe(101);
      expect(pins[0].type).toBe('PRIMARY_TARGET');
      expect(pins[0].priority).toBe('CRITICAL');
      expect(pins[0].notes).toBe(pin.notes);

      const retrieved = getTacticalPins('en123', storage);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe(pins[0].id);
    });

    test('updates existing pin on same town/type', () => {
      const pin1 = { townId: 200, type: 'STACK_BIREMES', priority: 'NORMAL', notes: 'v1' };
      saveTacticalPin('en123', pin1, storage);

      const pin2 = { townId: 200, type: 'STACK_BIREMES', priority: 'HIGH', notes: 'v2 updated' };
      const updated = saveTacticalPin('en123', pin2, storage);

      expect(updated).toHaveLength(1);
      expect(updated[0].priority).toBe('HIGH');
      expect(updated[0].notes).toBe('v2 updated');
    });

    test('removes pin cleanly by pinId', () => {
      const pin = { townId: 300, type: 'BREAK_SIEGE' };
      const [saved] = saveTacticalPin('en123', pin, storage);

      expect(getTacticalPins('en123', storage)).toHaveLength(1);
      const success = removeTacticalPin('en123', saved.id, storage);
      expect(success).toBe(true);
      expect(getTacticalPins('en123', storage)).toHaveLength(0);
    });

    test('handles corrupted or invalid storage data safely', () => {
      storage.setItem('grepo_tactical_pins_en123', 'invalid-json{[');
      expect(getTacticalPins('en123', storage)).toEqual([]);
    });
  });

  describe('Export to Sniper and Route Planner', () => {
    const samplePin = {
      townId: 400,
      townName: 'Olympus',
      townX: 500,
      townY: 500,
      type: 'PRIMARY_TARGET',
      priority: 'CRITICAL',
      originTownId: 100,
      targetReturnTime: 1789000000
    };

    test('exports pin to sniper URL with query parameters', () => {
      const url = exportPinToSniper(samplePin);
      expect(url).toContain('/snipe?');
      expect(url).toContain('targetTownId=400');
      expect(url).toContain('targetName=Olympus');
      expect(url).toContain('operationType=PRIMARY_TARGET');
      expect(url).toContain('priority=CRITICAL');
      expect(url).toContain('originTownId=100');
      expect(url).toContain('targetReturnTime=1789000000');
    });

    test('exports pin to Route Planner target object', () => {
      const plannerData = exportPinToPlanner(samplePin);
      expect(plannerData).toBeDefined();
      expect(plannerData.targetTownId).toBe(400);
      expect(plannerData.targetName).toBe('Olympus');
      expect(plannerData.townX).toBe(500);
      expect(plannerData.townY).toBe(500);
      expect(plannerData.priority).toBe('CRITICAL');
    });
  });
});
