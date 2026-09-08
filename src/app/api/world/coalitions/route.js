import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const COALITIONS_FILE = path.join(DATA_DIR, 'coalitions.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(COALITIONS_FILE)) {
    fs.writeFileSync(COALITIONS_FILE, JSON.stringify({}), 'utf-8');
  }
}

function getStoredCoalitions() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(COALITIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveStoredCoalitions(data) {
  ensureDataFile();
  fs.writeFileSync(COALITIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  try {
    const all = getStoredCoalitions();
    const coalitions = all[worldId] || [];
    return NextResponse.json({ success: true, worldId, coalitions });
  } catch (error) {
    console.error("Coalitions API GET Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const worldId = (body.worldId || 'hu119').toLowerCase();
    const coalitions = Array.isArray(body.coalitions) ? body.coalitions : [];

    const all = getStoredCoalitions();
    all[worldId] = coalitions;
    saveStoredCoalitions(all);

    return NextResponse.json({ success: true, worldId, coalitions });
  } catch (error) {
    console.error("Coalitions API POST Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
