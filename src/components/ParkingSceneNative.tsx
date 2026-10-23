/**
 * Native SVG adaptation of PASS-FE-REACT's ParkingScene3D / ParkingMap.
 * It renders the web architectural scene directly from Laravel geometry:
 * no Google Maps tiles, WebView, or independently maintained slot coordinates.
 * WebGL is not available in this Expo Go scene, so the web SVG architectural
 * fallback is the visual reference for the mobile 3D-style view.
 */
import React, { memo, useMemo } from 'react';
import {
  Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon,
  Polyline, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { slotColors, type MapSlot, type ParkingMapData, type Point } from '../services/parkingMap';

const ELEVATION = 52 * Math.PI / 180;
const SY = Math.sin(ELEVATION);
const SZ = Math.cos(ELEVATION);
const GRASS = 1.6;
const PAVE = 2.6;
const ASPHALT = '#2E343F';

export const project3D = ([x, y]: Point, z = 0): Point => [x, y * SY - z * SZ];
const poly = (pts: Point[]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const lift = (pts: Point[], z: number) => pts.map(p => project3D(p, z));

export function slotRect(cx: number, cy: number, w: number, h: number, angle: number): Point[] {
  const a = angle * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([u, v]): Point => [cx + u * c - v * s, cy + u * s + v * c]);
}

const move = ([x, y]: Point, deg: number, u: number, v = 0): Point => {
  const r = deg * Math.PI / 180;
  return [x + u * Math.cos(r) - v * Math.sin(r), y + u * Math.sin(r) + v * Math.cos(r)];
};

function signedArea(pts: Point[]) {
  return pts.reduce((sum, a, i) => {
    const b = pts[(i + 1) % pts.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
}

function inside(p: Point, pts: Point[]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function nearBorder(p: Point, pts: Point[]) {
  let d = Infinity;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  });
  return d;
}

/** Same deterministic tree-placement rules as the web architectural fallback. */
function treesFor(data: ParkingMapData): { at: Point; r: number }[] {
  const g = data.geometry;
  if (!g.site) return [];
  const site = g.site.polygon;
  const paving = [...(g.connector ? [g.connector.polygon] : []), ...g.areas.map(a => a.polygon), g.road.polygon];
  const outward = signedArea(site) > 0 ? 1 : -1;
  const trees: { at: Point; r: number }[] = [];
  site.forEach((a, i) => {
    const b = site[(i + 1) % site.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) return;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const nx = -uy * outward, ny = ux * outward;
    for (let d = 8; d < len - 6; d += 17) {
      const p: Point = [a[0] + ux * d + nx * 6, a[1] + uy * d + ny * 6];
      if (!inside(p, site)) continue;
      if (paving.some(q => inside(p, q) || nearBorder(p, q) < 6)) continue;
      if (Math.hypot(p[0] - g.gate.at[0], p[1] - g.gate.at[1]) < 32) continue;
      if (g.areas.some(ar => ar.sign_at && Math.hypot(p[0] - ar.sign_at[0], p[1] - ar.sign_at[1]) < 16)) continue;
      trees.push({ at: p, r: 3.6 + ((i * 7 + Math.round(d)) % 5) * 0.35 });
    }
  });
  return trees;
}

const prismFaces = (footprint: Point[], z0: number, z1: number) => {
  const positive = signedArea(footprint) > 0;
  const walls: { points: string; darkness: number }[] = [];
  footprint.forEach((a, i) => {
    const b = footprint[(i + 1) % footprint.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = positive ? dy / len : -dy / len, ny = positive ? -dx / len : dx / len;
    if (ny <= 0.02) return;
    walls.push({ points: poly([project3D(a,z0),project3D(b,z0),project3D(b,z1),project3D(a,z1)]), darkness: 0.86 - 0.14 * nx });
  });
  return { walls, top: poly(lift(footprint, z1)) };
};

function shade(hex: string, factor: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function Prism({ footprint, bottom, top, face, side, stroke, dash }: {
  footprint: Point[]; bottom: number; top: number; face: string; side: string; stroke?: string; dash?: string;
}) {
  const p = prismFaces(footprint, bottom, top);
  return <G>
    {p.walls.map((w, i) => <Polygon key={i} points={w.points} fill={shade(side, w.darkness)}/>)}
    <Polygon points={p.top} fill={face} stroke={stroke} strokeWidth={0.6} strokeDasharray={dash}/>
  </G>;
}

const hashColor = (plate: string) => {
  const colors = ['#F8FAFC','#CBD5E1','#1E3A8A','#2563EB','#1F2937','#0EA5E9','#E5E7EB','#FBBF24','#94A3B8'];
  let hash = 0;
  for (const ch of plate) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
};

function Vehicle({ slot }: { slot: MapSlot }) {
  if (!slot.occupant || slot.x === null || slot.y === null || slot.w === null || slot.h === null) return null;
  const c: Point = [slot.x, slot.y];
  const mc = slot.area_code === 'MC' || /motor/i.test(slot.occupant.vehicle_type ?? '');
  const deg = slot.h >= slot.w ? slot.rotation + 90 : slot.rotation;
  const long = Math.max(slot.w, slot.h), short = Math.min(slot.w, slot.h);
  const L = mc ? Math.min(long * 0.78, 11) : Math.min(long * 0.84, short * 2.4);
  const W = mc ? Math.min(short * 0.34, 3) : Math.min(short * 0.72, L * 0.48);
  const color = hashColor(slot.occupant.plate_number);
  const wheels = [-1,1].flatMap(u => [-1,1].map(v => move(c,deg,u*L*0.32,v*W*0.47)));
  const roof = move(c,deg,-L*0.06);
  return <G>
    {wheels.map((p,i) => <Prism key={i} footprint={slotRect(p[0],p[1],mc?2.6:3.2,mc?W*0.4:1.6,deg)} bottom={PAVE} top={PAVE+(mc?2:2.2)} face="#111827" side="#111827"/>)}
    <Prism footprint={slotRect(c[0],c[1],mc?L*0.62:L,mc?W*0.75:W,deg)} bottom={PAVE+1} top={PAVE+(mc?3.6:4.2)} face={color} side={color}/>
    <Prism footprint={slotRect(roof[0],roof[1],mc?L*0.37:L*0.54,mc?W*0.62:W*0.86,deg)} bottom={PAVE+(mc?3.6:4.2)} top={PAVE+(mc?4.6:6.6)} face="#1E293B" side="#334155"/>
    {!mc && <Prism footprint={slotRect(roof[0],roof[1],L*0.38,W*0.74,deg)} bottom={PAVE+6.6} top={PAVE+7.2} face={shade(color,1.05)} side={shade(color,0.8)}/>}
    {mc && <Prism footprint={slotRect(...move(c,deg,L*0.27),0.7,W*1.8,deg)} bottom={PAVE+4.6} top={PAVE+5.3} face="#475569" side="#334155"/>}
    {!mc && [-0.3,0.3].map(v => <G key={v}>
      <Prism footprint={slotRect(...move(c,deg,L*0.49,v*W),0.7,W*0.22,deg)} bottom={PAVE+2.4} top={PAVE+3.6} face="#FEF3C7" side="#FEF3C7"/>
      <Prism footprint={slotRect(...move(c,deg,-L*0.49,v*W),0.7,W*0.22,deg)} bottom={PAVE+2.4} top={PAVE+3.6} face="#DC2626" side="#DC2626"/>
    </G>)}
  </G>;
}

function Cone({ slot }: { slot: MapSlot }) {
  if (slot.x === null || slot.y === null || slot.w === null || slot.h === null) return null;
  const deg = slot.h >= slot.w ? slot.rotation + 90 : slot.rotation;
  const c = move([slot.x,slot.y],deg,-Math.max(slot.w,slot.h)*0.32);
  return <G>
    <Prism footprint={slotRect(c[0],c[1],3.4,3.4,slot.rotation)} bottom={PAVE} top={PAVE+0.5} face="#EA580C" side="#C2410C"/>
    <Prism footprint={slotRect(c[0],c[1],2.2,2.2,slot.rotation)} bottom={PAVE+0.5} top={PAVE+2} face="#F97316" side="#EA580C"/>
    <Prism footprint={slotRect(c[0],c[1],1.6,1.6,slot.rotation)} bottom={PAVE+2} top={PAVE+3} face="#FFFFFF" side="#E2E8F0"/>
    <Prism footprint={slotRect(c[0],c[1],1.1,1.1,slot.rotation)} bottom={PAVE+3} top={PAVE+4.2} face="#F97316" side="#EA580C"/>
  </G>;
}

function Tree({ at, r }: { at: Point; r: number }) {
  const [sx,sy] = project3D([at[0]+r*0.7,at[1]+r*0.5],GRASS);
  const [x,y] = project3D(at,GRASS+4+r);
  const [tx,ty] = project3D(at,GRASS);
  return <G>
    <Ellipse cx={sx} cy={sy} rx={r*1.1} ry={r*0.75} fill="#14532D" opacity={0.28}/>
    <Line x1={tx} y1={ty} x2={x} y2={y} stroke="#6B4F2E" strokeWidth={0.9}/>
    <Circle cx={x} cy={y} r={r} fill="#2F6B3A"/>
    <Circle cx={x-r*0.25} cy={y-r*0.3} r={r*0.68} fill="#3F8A49"/>
    <Circle cx={x-r*0.38} cy={y-r*0.48} r={r*0.32} fill="#64B06A"/>
  </G>;
}

const arrow = (a: Point,b: Point,shaft=1.3,head=4.2,headLen=4.4): Point[] => {
  const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
  const ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len,nx=-uy,ny=ux;
  const hb:Point=[b[0]-ux*headLen,b[1]-uy*headLen];
  const side=(p:Point,w:number):Point=>[p[0]+nx*w,p[1]+ny*w];
  return [side(a,shaft/2),side(hb,shaft/2),side(hb,head/2),b,side(hb,-head/2),side(hb,-shaft/2),side(a,-shaft/2)];
};

const before = (pts:Point[],d:number):Point => {
  const end=pts[pts.length-1],prev=pts[pts.length-2];
  const len=Math.hypot(end[0]-prev[0],end[1]-prev[1])||1;
  return [end[0]-(end[0]-prev[0])*d/len,end[1]-(end[1]-prev[1])*d/len];
};

function AccessGate({ data, onGate }: {data:ParkingMapData;onGate:()=>void}) {
  const g = data.geometry;
  const at=g.gate.at,deg=g.gate.angle;
  const pole=(u:number,v:number)=>move(at,deg,u,v);
  const booth=pole(0,-22);
  const [x,y]=project3D(g.gate.label_at);
  const [anchorX,anchorY]=project3D(pole(2,0),PAVE+30);
  return <G onPress={onGate} accessible accessibilityLabel="Main entrance and exit gate">
    <Prism footprint={slotRect(booth[0],booth[1],9,7.5,deg)} bottom={GRASS} top={GRASS+9} face="#F1F5F9" side="#E2E8F0"/>
    <Prism footprint={slotRect(booth[0],booth[1],11,9.5,deg)} bottom={GRASS+9} top={GRASS+10.4} face="#080677" side="#080677"/>
    <Prism footprint={slotRect(...pole(2,0),16,2.2,deg)} bottom={PAVE} top={PAVE+0.8} face="#E2E8F0" side="#94A3B8"/>
    {[-4,6].map(u=><Prism key={u} footprint={slotRect(...pole(u,0),1.4,1.4,deg)} bottom={PAVE+0.8} top={PAVE+5} face="#2563EB" side="#1E3A8A"/>)}
    {[-14.5,14.5].map(v=><Prism key={v} footprint={slotRect(...pole(2,v),1.6,1.6,deg)} bottom={PAVE} top={PAVE+14} face="#CBD5E1" side="#94A3B8"/>)}
    <Prism footprint={slotRect(...pole(2,0),1.6,30.6,deg)} bottom={PAVE+12.6} top={PAVE+14.2} face="#1E1B8F" side="#080677"/>
    {[-1,5].map((u,b)=>[-1,1].flatMap((_,k)=>[0,1].map((__,t)=>{
      const v=(b?1:-1)*(4+k*3.3+t*2.8);
      return <Prism key={`${b}${k}${t}`} footprint={slotRect(...pole(u,v),3.6,0.8,deg+90)} bottom={PAVE+6} top={PAVE+6.9} face={t?'#FFFFFF':'#DC2626'} side={t?'#CBD5E1':'#991B1B'}/>;
    })))}
    <Line x1={anchorX} y1={anchorY} x2={x-6} y2={y+9} stroke="#080677" strokeWidth={0.6}/>
    <G transform={`translate(${x} ${y})`}>
      <Rect x={-6} y={-8} width={122} height={22} rx={4} fill="#080677" stroke="#FFFFFF" strokeWidth={0.6}/>
      <SvgText x={0} y={1} fontSize={6.5} fontWeight="bold" fill="#FFFFFF">{g.gate.label}</SvgText>
      <SvgText x={0} y={9} fontSize={4} fill="#BFDBFE">{g.gate.sublabel} · RFID / Visitor QR</SvgText>
      <Circle cx={109} cy={-2} r={1.8} fill={data.gate?.gate_status==='active'?'#22C55E':'#F59E0B'}/>
    </G>
  </G>;
}

interface SceneProps {
  data:ParkingMapData;
  area:'ALL'|'MC'|'CAR';
  selectedId:number|null;
  onSelect:(slot:MapSlot)=>void;
  onGate:()=>void;
  showPlates:boolean;
}
const placed = (s:MapSlot) => s.placed && s.x!==null && s.y!==null && s.w!==null && s.h!==null;

/** True architectural isometric SVG scene, matching the web SVG fallback. */
export const ParkingScene3DNative=memo(function ParkingScene3DNative({data,area,selectedId,onSelect,onGate,showPlates}:SceneProps){
  const g=data.geometry;
  const shown=data.slots.filter(s=>placed(s)&&(area==='ALL'||s.area_code===area));
  const trees=useMemo(()=>treesFor(data),[data.geometry]);
  const paved=[...(g.connector?[g.connector.polygon]:[]),...g.areas.map(a=>a.polygon),g.road.polygon];
  const standing=[
    ...trees.map((t,i)=>({key:`tree-${i}`,y:t.at[1],element:<Tree at={t.at} r={t.r}/> })),
    ...shown.filter(s=>s.occupant||s.status==='maintenance').map(s=>({key:`slot-${s.slot_id}`,y:s.y!,element:<G onPress={()=>onSelect(s)}>{s.occupant?<Vehicle slot={s}/>:<Cone slot={s}/>}</G>})),
    ...(g.islands??[]).map((island,i)=>{
      const c:Point=island.polygon.reduce(([x,y],p)=>[x+p[0]/island.polygon.length,y+p[1]/island.polygon.length],[0,0]);
      return {key:`island-${i}`,y:c[1],element:<Tree at={c} r={4.6}/>};
    }),
    {key:'gate',y:g.gate.at[1],element:<AccessGate data={data} onGate={onGate}/>},
  ].sort((a,b)=>a.y-b.y);
  return <G>
    <Defs>
      <LinearGradient id="native-ground" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#EEF2F7"/><Stop offset="1" stopColor="#E2E8F0"/></LinearGradient>
      <LinearGradient id="native-grass" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#9CC97A"/><Stop offset="1" stopColor="#7DB061"/></LinearGradient>
      <LinearGradient id="native-asphalt" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#3A414D"/><Stop offset="0.55" stopColor={ASPHALT}/><Stop offset="1" stopColor="#262B34"/></LinearGradient>
      <LinearGradient id="native-sign" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#2563EB"/><Stop offset="1" stopColor="#1D4ED8"/></LinearGradient>
    </Defs>
    <Rect x={-500} y={-500} width={2200} height={1800} fill="#EEF2F7"/>
    {g.site && <G>
      <Polygon points={poly(g.site.polygon.map(([x,y]):Point=>project3D([x+4,y+6])))} fill="#0F172A" opacity={0.1}/>
      <Prism footprint={g.site.polygon} bottom={0} top={GRASS} face="url(#native-grass)" side="#6B8F4E"/>
    </G>}
    {paved.map((p,i)=><Prism key={`pave-${i}`} footprint={p} bottom={GRASS} top={PAVE} face="url(#native-asphalt)" side="#AEB8C6"/>)}
    {g.areas.map(a=><Polygon key={`boundary-${a.area}`} points={poly(lift(a.polygon,PAVE))} fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.6} strokeDasharray="5 2.5"/>)}
    <Polygon points={poly(lift(g.road.polygon,PAVE))} fill="none" stroke="#FACC15" strokeWidth={0.6}/>
    <SvgText x={project3D(g.road.label_at,PAVE)[0]} y={project3D(g.road.label_at,PAVE)[1]} fontSize={4.6} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">{g.road.label}</SvgText>
    {(g.islands??[]).map((island,i)=><Prism key={`isle-${i}`} footprint={island.polygon} bottom={PAVE} top={PAVE+0.9} face="#7DB061" side="#CBD5E1" stroke="#E2E8F0"/>)}
    {g.lanes.filter(l=>l.kind!=='to_area'&&l.points.length>1).map((l,i)=>{
      const pts=l.reverse?[...l.points].reverse():l.points;
      return <G key={`lane-${i}`}>
        {l.kind==='lane'&&<Polyline points={poly(lift(pts,PAVE))} fill="none" stroke="#FFFFFF" strokeOpacity={0.4} strokeWidth={0.6} strokeDasharray="4 3"/>}
        <Polygon points={poly(lift(arrow(before(pts,9),pts[pts.length-1]),PAVE))} fill="#FFFFFF" opacity={0.9}/>
      </G>;
    })}
    {(data.extra_bays??[]).filter(b=>area==='ALL'||b.area===area).map((b,i)=><Polygon key={`unbound-${i}`} points={poly(lift(slotRect(b.x,b.y,b.w,b.h,b.rotation),PAVE))} fill={b.kind==='aisle'?'#E2E8F0':'#FFFFFF'} fillOpacity={0.04} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={0.4}/>)}
    {shown.map(s=>{
      const c=slotColors(s);
      const corners=slotRect(s.x!,s.y!,s.w!,s.h!,s.rotation);
      return <G key={`stall-${s.slot_id}`} onPress={()=>onSelect(s)} accessible accessibilityLabel={`Slot ${s.slot_code}, ${s.status}`}>
        <Polygon points={poly(lift(slotRect(s.x!,s.y!,Math.max(0.2,s.w!-1),Math.max(0.2,s.h!-1),s.rotation),PAVE))} fill={c.fill} fillOpacity={s.status==='maintenance'?0.75:0.6}/>
        <Polygon points={poly(lift(corners,PAVE))} fill="none" stroke={selectedId===s.slot_id?'#FACC15':'#FFFFFF'} strokeWidth={selectedId===s.slot_id?1.1:0.45}/>
        {s.status==='occupied'&&s.occupant?.confirmed===false&&<Polygon points={poly(lift(corners,PAVE))} fill="none" stroke="#FFFFFF" strokeWidth={0.5} strokeDasharray="1.2 0.8"/>}
        {s.accessible&&!s.occupant&&<G><Rect x={project3D([s.x!,s.y!],PAVE)[0]-4} y={project3D([s.x!,s.y!],PAVE)[1]-0.5} width={8} height={6.4} rx={1} fill="#2563EB"/>
          <SvgText x={project3D([s.x!,s.y!],PAVE)[0]} y={project3D([s.x!,s.y!],PAVE)[1]+4} fontSize={4.7} textAnchor="middle" fill="#FFFFFF">♿</SvgText></G>}
      </G>;
    })}
    {shown.filter(s=>s.occupant).map(s=>{
      const deg=s.h!>=s.w!?s.rotation+90:s.rotation;
      return <Polygon key={`shadow-${s.slot_id}`} points={poly(lift(slotRect(s.x!+1.8,s.y!+1.6,Math.max(s.w!,s.h!)*0.75,Math.min(s.w!,s.h!)*0.7,deg),PAVE))} fill="#020617" opacity={0.3}/>;
    })}
    {g.lanes.filter(l=>l.kind==='to_area'&&l.points.length>1).map((l,i)=>{
      const pts=l.points,tail=before(pts,7),line=poly(lift(pts.slice(0,-1).concat([tail]),PAVE+0.3));
      return <G key={`route-${i}`}>
        <Polyline points={line} fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"/>
        <Polyline points={line} fill="none" stroke="#2563EB" strokeWidth={1.4} strokeDasharray="3 1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <Polygon points={poly(lift(arrow(tail,pts[pts.length-1],1.4,5,5),PAVE+0.3))} fill="#2563EB" stroke="#FFFFFF" strokeWidth={0.5}/>
      </G>;
    })}
    {standing.map(({key,element})=><G key={key}>{element}</G>)}
    {g.lanes.filter(l=>l.kind==='to_area'&&l.label&&l.label_at).map((l,i)=>{
      const [x,y]=project3D(l.label_at!,PAVE),w=l.label!.length*2.6+6;
      return <G key={`route-label-${i}`} transform={`translate(${x} ${y})`}>
        <Rect x={0} y={-5} width={w} height={7} rx={3.5} fill="#2563EB" stroke="#FFFFFF" strokeWidth={0.5}/>
        <SvgText x={w/2} y={-0.6} fontSize={4} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">{l.label}</SvgText>
      </G>;
    })}
    {shown.map(s=>{
      const fs=Math.max(3,Math.min(s.area_code==='MC'?4.6:6.4,Math.min(s.w!,s.h!)*0.58));
      const occupied=!!s.occupant,mc=s.area_code==='MC';
      const [x,y]=project3D([s.x!,s.y!],PAVE+(occupied?(mc?6.6:8.8):s.status==='maintenance'?5.4:0.1));
      const label=String(Number(s.slot_code.split('-').pop()??s.slot_code));
      const plate=showPlates&&s.occupant?s.occupant.plate_number:null;
      const w=Math.max(label.length*fs*0.62+2.4,plate?plate.length*fs*0.32+2:0),h=fs+(plate?fs*0.6:0)+1.2;
      return <G key={`number-${s.slot_id}`} onPress={()=>onSelect(s)}>
        {occupied?<G>
          <Rect x={x-w/2} y={y-h+0.6} width={w} height={h} rx={1.4} fill="#DC2626" stroke="#FFFFFF" strokeWidth={0.35}/>
          <SvgText x={x} y={y-h+0.6+fs*0.88} textAnchor="middle" fontSize={fs*0.9} fontWeight="bold" fill="#FFFFFF">{label}</SvgText>
          {plate&&<SvgText x={x} y={y-0.5} textAnchor="middle" fontSize={fs*0.48} fill="#FEE2E2">{plate}</SvgText>}
        </G>:<SvgText x={x} y={y+(s.accessible?-fs*0.55:0)+fs*0.3} fontSize={fs} fontWeight="bold" fill="#FFFFFF" textAnchor="middle" stroke="#0F172A" strokeWidth={0.2}>{label}</SvgText>}
        {s.incident&&<G><Circle cx={x+w/2+0.5} cy={y-h} r={2.5} fill="#F59E0B" stroke="#FFFFFF" strokeWidth={0.45}/><SvgText x={x+w/2+0.5} y={y-h+1} fontSize={3.4} textAnchor="middle" fill="#FFFFFF">!</SvgText></G>}
      </G>;
    })}
    {g.areas.filter(a=>area==='ALL'||a.area===area).map(a=>{
      const stats=data.areas?.find(x=>x.area_code===a.area);
      const at=a.sign_at??a.label_at,[bx,by]=project3D(at,GRASS),[,top]=project3D(at,GRASS+10);
      const title=a.area==='MC'?'MOTORCYCLE PARKING':'CAR PARKING';
      // The web architectural drawing has 45 car bays even though the
      // database retains 55 configured car inventory records. Signs describe
      // the drawing, not the administrative inventory total.
      const drawn=data.geometry.measurement_basis?.inventory;
      const bays=a.area==='MC'?drawn?.motorcycle_drawn:drawn?.car_drawn;
      const sub=bays?`${bays} PROPOSED BAYS`:'';
      const w=Math.max(title.length*3.15,sub.length*2.2)+17;
      return <G key={`sign-${a.area}`}>
        <Ellipse cx={bx+2} cy={by+0.6} rx={3} ry={1.2} fill="#0F172A" opacity={0.25}/>
        <Line x1={bx} y1={by} x2={bx} y2={top} stroke="#64748B" strokeWidth={1}/>
        <G transform={`translate(${bx-w/2} ${top-15})`}>
          <Rect width={w} height={16} rx={3} fill="url(#native-sign)" stroke="#FFFFFF" strokeWidth={0.7}/>
          <Rect x={3} y={3} width={10} height={10} rx={2} fill="#FFFFFF"/>
          <SvgText x={8} y={11} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1D4ED8">P</SvgText>
          <SvgText x={16} y={7} fontSize={5} fontWeight="bold" fill="#FFFFFF">{title}</SvgText>
          {sub&&<SvgText x={16} y={12.6} fontSize={3.4} fill="#BFDBFE">{sub}</SvgText>}
        </G>
      </G>;
    })}
    {selectedId!==null&&shown.filter(s=>s.slot_id===selectedId).map(s=><Polygon key="selection" points={poly(lift(slotRect(s.x!,s.y!,s.w!+3,s.h!+3,s.rotation),PAVE))} fill="none" stroke="#38BDF8" strokeWidth={1.5}/>)}
  </G>;
});

/** 2D rendering deliberately follows the exact palette and markings of the web ParkingMap. */
export const ParkingPlanNative=memo(function ParkingPlanNative({data,area,selectedId,onSelect,onGate,showPlates}:SceneProps){
  const g=data.geometry;
  const draw=(p:Point[])=>poly(p);
  // The web's area controls move the camera; they do not remove the other
  // area or any of its slots from the same site layout.
  const shown=data.slots.filter(placed);
  const textAngle=(rotation:number,w:number,h:number)=>{
    let angle=h>w?rotation-90:rotation;
    while(angle>90)angle-=180;
    while(angle< -90)angle+=180;
    return angle;
  };
  return <G>
    <Rect x={-500} y={-500} width={2200} height={1800} fill="#F8FAFC"/>
    {g.connector&&<Polygon points={draw(g.connector.polygon)} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth={0.5}/>}
    {g.areas.map(a=><G key={`area-${a.area}`}>
      <Polygon points={draw(a.polygon)} fill={a.area==='CAR'?'#EEF2FF':'#ECFEFF'} stroke="#1E293B" strokeWidth={1.4}/>
      <Polygon points={draw(a.polygon)} fill="none" stroke="#FFFFFF" strokeWidth={0.5}/>
    </G>)}
    {g.circulation?.filter(c=>['walkway','car_approach'].includes(c.kind)).map((c,i)=><Polygon key={`walk-${i}`} points={draw(c.polygon)} fill={c.kind==='walkway'?'#BFDBFE':'#FDE68A'} fillOpacity={c.kind==='car_approach'?0.7:1} stroke="#94A3B8" strokeWidth={0.3}/>)}
    {g.circulation_labels?.map((l,i)=><SvgText key={`circulation-${i}`} x={l.at[0]} y={l.at[1]} transform={`rotate(${l.angle} ${l.at[0]} ${l.at[1]})`} fontSize={5} fill="#475569" textAnchor="middle">{l.text}</SvgText>)}
    <Polygon points={draw(g.road.polygon)} fill="#FACC15" stroke="#A16207" strokeWidth={0.6}/>
    <SvgText x={g.road.label_at[0]} y={g.road.label_at[1]} transform={`rotate(${g.road.label_angle} ${g.road.label_at[0]} ${g.road.label_at[1]})`} textAnchor="middle" fontSize={5.5} fontWeight="bold" fill="#713F12">{g.road.label}</SvgText>
    {g.lanes.map((l,i)=><G key={`lane-${i}`}>
      <Polyline points={draw(l.points)} fill="none" stroke={l.kind==='to_area'?'#2563EB':l.kind.startsWith('road')?'#713F12':'#94A3B8'} strokeWidth={l.kind==='to_area'?1.2:0.8} strokeDasharray={l.kind==='to_area'?'3 2':l.kind==='lane'?'4 3':undefined}/>
      {l.points.length>1&&<Polygon points={draw(arrow(before(l.points,Math.min(5,Math.max(1,Math.hypot(l.points.at(-1)![0]-l.points.at(-2)![0],l.points.at(-1)![1]-l.points.at(-2)![1])/2))),l.points.at(-1)!,0.8,3,3))} fill={l.kind==='to_area'?'#2563EB':'#475569'}/>}
      {l.label&&l.label_at&&<SvgText x={l.label_at[0]} y={l.label_at[1]} transform={`rotate(${l.label_angle??0} ${l.label_at[0]} ${l.label_at[1]})`} fontSize={5} fontWeight="bold" fill="#1D4ED8">{l.label}</SvgText>}
    </G>)}
    {g.areas.map(a=><SvgText key={`title-${a.area}`} x={a.label_at[0]} y={a.label_at[1]} transform={`rotate(${a.label_angle} ${a.label_at[0]} ${a.label_at[1]})`} textAnchor="middle" fontSize={6.5} fontWeight="bold" fill="#080677">{a.label}</SvgText>)}
    {(data.extra_bays??[]).map((b,i)=><G key={`extra-${i}`}>
      <Polygon points={draw(slotRect(b.x,b.y,b.w,b.h,b.rotation))} fill={b.kind==='aisle'?'#CBD5E1':'#FFFFFF'} stroke={b.kind==='pwd'?'#2563EB':'#CBD5E1'} strokeWidth={0.4} strokeDasharray={b.kind==='unbound'?'1.5 1':undefined}/>
      {b.kind!=='aisle'&&<SvgText x={b.x} y={b.y+1} textAnchor="middle" fontSize={Math.min(4,Math.min(b.w,b.h)*0.5)} fill={b.kind==='pwd'?'#2563EB':'#CBD5E1'}>{b.kind==='pwd'?'♿':b.label}</SvgText>}
    </G>)}
    {shown.map(s=>{
      const color=slotColors(s),p=slotRect(s.x!,s.y!,s.w!,s.h!,s.rotation);
      const fs=Math.min(5,Math.min(s.w!,s.h!)*0.62);
      const angle=textAngle(s.rotation,s.w!,s.h!)-s.rotation;
      return <G key={`slot-${s.slot_id}`} onPress={()=>onSelect(s)} accessible accessibilityLabel={`Slot ${s.slot_code}, ${s.status}`}>
        <Polygon points={draw(p)} fill={color.fill} stroke={selectedId===s.slot_id?'#080677':color.outline} strokeWidth={selectedId===s.slot_id?1.4:0.5} strokeDasharray={s.occupant?.confirmed===false?'1.2 0.8':undefined}/>
        <G transform={`translate(${s.x!} ${s.y!}) rotate(${s.rotation})`}>
          <SvgText transform={`rotate(${angle})`} y={fs*0.32} fontSize={fs} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">{s.accessible?'♿ ':''}{String(Number(s.slot_code.split('-').pop()??s.slot_code))}</SvgText>
          {showPlates&&s.occupant&&<SvgText transform={`rotate(${angle})`} y={fs*0.9} fontSize={2.3} fill="#FFFFFF" textAnchor="middle">{s.occupant.plate_number}</SvgText>}
        </G>
        {s.incident&&<G><Circle cx={s.x!+s.w!/2-1} cy={s.y!-s.h!/2+1} r={2.4} fill="#F59E0B" stroke="#FFFFFF" strokeWidth={0.4}/><SvgText x={s.x!+s.w!/2-1} y={s.y!-s.h!/2+2.2} textAnchor="middle" fontSize={3.2} fill="#FFFFFF">!</SvgText></G>}
      </G>;
    })}
    <G onPress={onGate} accessible accessibilityLabel="Main entrance and exit">
      <Line x1={g.gate.at[0]} y1={g.gate.at[1]} x2={g.gate.label_at[0]-6} y2={g.gate.label_at[1]+8} stroke="#080677" strokeWidth={0.6}/>
      <G transform={`translate(${g.gate.at[0]} ${g.gate.at[1]}) rotate(${g.gate.angle+90})`}>
        <Rect x={-13} y={-2} width={26} height={4} rx={1} fill="#080677"/>
        <Circle cx={-13} cy={0} r={2.2} fill="#16A34A"/><Circle cx={13} cy={0} r={2.2} fill="#16A34A"/>
      </G>
      <G transform={`translate(${g.gate.label_at[0]} ${g.gate.label_at[1]})`}>
        <Rect x={-6} y={-8} width={118} height={21} rx={3} fill="#080677"/>
        <SvgText x={0} y={1} fontSize={6.5} fontWeight="bold" fill="#FFFFFF">{g.gate.label}</SvgText>
        <SvgText x={0} y={9} fontSize={4.2} fill="#BFDBFE">{g.gate.sublabel}</SvgText>
      </G>
    </G>
  </G>;
});
