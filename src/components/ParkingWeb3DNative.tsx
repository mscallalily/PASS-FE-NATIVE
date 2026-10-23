/**
 * Native OpenGL port of the WEB ParkingLot3D scene.  This deliberately uses
 * @react-three/fiber/native (Expo GL), not a skewed SVG or a WebView.
 * All coordinates, parking statuses, traffic markings and role-sensitive slot
 * callbacks come from the same Laravel /parking/* map used by the web app.
 *
 * The world primitives below follow PASS-FE-REACT's ParkingLot3D.tsx:
 * perspective FOV 34, elevation 50 degrees, coloured bays on dark asphalt,
 * full site boundaries, rows, 3-D trees and its single RFID/QR gate.
 * Native SVG supplies legible screen-facing signs because CanvasTexture
 * requires a browser document canvas that Expo Go does not provide.
 */
import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Canvas, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react-native';
import type { MapSlot, ParkingMapData, Point } from '../services/parkingMap';
import { C } from '../theme';
import { T } from './ui';

type Area = 'ALL' | 'MC' | 'CAR';
type Box2 = { minX: number; minY: number; maxX: number; maxY: number };
type CameraPose = { target: [number, number]; distance: number };
const FOV = 34;
const ELEV = THREE.MathUtils.degToRad(50);
const EYE = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
const ASPHALT_TOP = 0.8, TINT = ASPHALT_TOP + 0.03, PAINT = ASPHALT_TOP + 0.06;
const DEG = Math.PI / 180;

const BOX = new THREE.BoxGeometry(1, 1, 1);
const TRUNK = new THREE.CylinderGeometry(0.45, 0.6, 1, 6);
const CANOPY = new THREE.IcosahedronGeometry(1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 16);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
const cached = new Map<string, THREE.Material>();
const standard = (color: string, params: THREE.MeshStandardMaterialParameters = {}) => {
  const key = color + JSON.stringify(params);
  if (!cached.has(key)) cached.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...params }));
  return cached.get(key)!;
};
const painted = (color: string, opacity = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.9,
  transparent: opacity < 1, opacity, side: THREE.DoubleSide, polygonOffset: true,
  polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
/** Same seeded speckle palette as the browser canvas texture, generated
 * directly into RGBA pixels because React Native has no document canvas. */
function noiseTexture(base:string,speckles:string[],scale:number){
  const size=256, pixels=new Uint8Array(size*size*4);
  const rgb=(hex:string):[number,number,number]=>[
    parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
  const background=rgb(base);
  for(let i=0;i<size*size;i++){
    pixels[i*4]=background[0];pixels[i*4+1]=background[1];pixels[i*4+2]=background[2];pixels[i*4+3]=255;
  }
  let seed=7;
  const rand=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let i=0;i<5200;i++){
    const color=rgb(speckles[i%speckles.length]);
    const alpha=0.18+rand()*0.25;
    const x=Math.floor(rand()*size),y=Math.floor(rand()*size);
    const w=1+rand()*1.6,h=1+rand()*1.6;
    for(let row=y;row<Math.min(size,y+h);row++)for(let col=x;col<Math.min(size,x+w);col++){
      const at=(row*size+col)*4;
      for(let j=0;j<3;j++)pixels[at+j]=Math.round(pixels[at+j]*(1-alpha)+color[j]*alpha);
    }
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(1/scale,1/scale);texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}
const asphaltTexture=noiseTexture('#30353E',['#1F242B','#454B55','#3A4049'],40);
const turfTexture=noiseTexture('#7FB262',['#6A9C50','#93C477','#5E8E46'],30);
const asphaltTop=new THREE.MeshStandardMaterial({map:asphaltTexture,roughness:0.95,color:'#FFFFFF'});
const turfTop=new THREE.MeshStandardMaterial({map:turfTexture,roughness:1});
const polygon = (points: Point[], bottom: number, top: number) => {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, -y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return geometry;
};
const flat = (points: Point[], elevation: number) => {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, -y)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, elevation, 0);
  return geometry;
};
const bay = (cx: number, cy: number, w: number, h: number, deg: number): Point[] => {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([u, v]): Point => [cx + u * c - v * s, cy + u * s + v * c]);
};
const offset = ([x, y]: Point, deg: number, u: number, v = 0): Point =>
  [x + u * Math.cos(deg * DEG) - v * Math.sin(deg * DEG), y + u * Math.sin(deg * DEG) + v * Math.cos(deg * DEG)];
const before = (pts: Point[], d: number): Point => {
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [b[0] - (b[0] - a[0]) * d / len, b[1] - (b[1] - a[1]) * d / len];
};
const arrow = (a: Point, b: Point, shaft = 1.3, head = 4.2, tipLength = 4.4): Point[] => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const nx = -uy, ny = ux, base: Point = [b[0] - ux * tipLength, b[1] - uy * tipLength];
  const side = (p: Point, width: number): Point => [p[0] + nx * width, p[1] + ny * width];
  return [side(a, shaft / 2), side(base, shaft / 2), side(base, head / 2), b,
    side(base, -head / 2), side(base, -shaft / 2), side(a, -shaft / 2)];
};
class PaintedGeometry {
  private values: number[] = [];
  constructor(private height: number) {}
  poly(pts: Point[]) {
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const triangle of tris) for (const i of triangle) this.values.push(pts[i][0], this.height, pts[i][1]);
    return this;
  }
  line(a: Point, b: Point, w: number) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) * w / 2 / len, ny = (b[0] - a[0]) * w / 2 / len;
    return this.poly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  outline(pts: Point[], width: number, closed = true) {
    for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) this.line(pts[i], pts[(i + 1) % pts.length], width);
    return this;
  }
  dashed(pts: Point[], width: number, dash: number, gap: number, closed = false) {
    const line = closed ? [...pts, pts[0]] : pts;
    for (let i = 0; i + 1 < line.length; i++) {
      const [a, b] = [line[i], line[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      for (let d = 0; d < len; d += dash + gap) {
        const e = Math.min(len, d + dash);
        this.line([a[0] + (b[0] - a[0]) * d / len, a[1] + (b[1] - a[1]) * d / len],
          [a[0] + (b[0] - a[0]) * e / len, a[1] + (b[1] - a[1]) * e / len], width);
      }
    }
    return this;
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.values, 3));
    geo.computeVertexNormals();
    return geo;
  }
}
const signedArea = (points: Point[]) => points.reduce((value, p, i) => {
  const b = points[(i + 1) % points.length];
  return value + p[0] * b[1] - b[0] * p[1];
}, 0);
const inside = ([x, y]: Point, points: Point[]) => {
  let match = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) match = !match;
  }
  return match;
};
const edgeDistance = (p: Point, points: Point[]) => {
  let best = Infinity;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  });
  return best;
};

function trees(data: ParkingMapData) {
  const g = data.geometry, site = g.site?.polygon;
  if (!site) return [];
  const paved = [...(g.connector ? [g.connector.polygon] : []), ...g.areas.map(a => a.polygon), g.road.polygon];
  // First perimeter planting from the web plantTrees routine.
  const out: { at: Point; r: number }[] = [];
  const clockwise = signedArea(site) > 0 ? 1 : -1;
  site.forEach((a, i) => {
    const b = site[(i + 1) % site.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) return;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    for (let d = 8; d < len - 6; d += 17) {
      const p: Point = [a[0] + ux * d - uy * clockwise * 6, a[1] + uy * d + ux * clockwise * 6];
      if (!inside(p, site) || paved.some(q => inside(p, q) || edgeDistance(p, q) < 6)) continue;
      if (Math.hypot(p[0] - g.gate.at[0], p[1] - g.gate.at[1]) < 32) continue;
      out.push({ at: p, r: 3.6 + ((i * 7 + Math.round(d)) % 5) * 0.35 });
    }
  });
  const bbox = bounds(site);
  // Second planted groves from the web's deterministic placement rule.
  for (let x = bbox.minX; x < bbox.maxX; x += 19) for (let y = bbox.minY; y < bbox.maxY; y += 17) {
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const p: Point = [x + (h - 0.5) * 8, y + ((h * 7) % 1 - 0.5) * 8];
    if (!inside(p, site) || edgeDistance(p, site) < 12) continue;
    if (paved.some(q => inside(p, q) || edgeDistance(p, q) < 9)) continue;
    if (Math.hypot(p[0] - g.gate.at[0], p[1] - g.gate.at[1]) < 34) continue;
    out.push({ at: p, r: 3.4 + h * 1.6 });
  }
  return out;
}

const bounds = (pts: Point[]): Box2 => ({ minX: Math.min(...pts.map(p => p[0])), minY: Math.min(...pts.map(p => p[1])),
  maxX: Math.max(...pts.map(p => p[0])), maxY: Math.max(...pts.map(p => p[1])) });
const homeBox = (data: ParkingMapData, area: Area): Box2 => {
  const g = data.geometry;
  // Match the web's full-site framing, but include the measured bay corners.
  // Otherwise a proposed stall extending outside an approximated parcel edge
  // may be clipped and look like it disappeared from the map.
  const relevant = data.slots.filter(s => (area === 'ALL' || s.area_code === area) &&
    s.placed && s.x != null && s.y != null && s.w != null && s.h != null);
  const slotCorners = relevant.flatMap(s => bay(s.x!, s.y!, s.w!, s.h!, s.rotation));
  const points = area === 'ALL'
    ? [...g.areas.flatMap(a => a.polygon), ...g.road.polygon, g.gate.at, ...slotCorners]
    : [...g.areas.filter(a => a.area === area).flatMap(a => a.polygon), ...slotCorners];
  const all = points.length ? points : g.road.polygon;
  const b = bounds(all), pad = area === 'ALL' ? 6 : 8;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
};

/** The web camera's perspective framing, without browser MapControls. */
export function fitPerspective(box: Box2, width: number, height: number): CameraPose {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const t = Math.tan(FOV * DEG / 2);
  const target = new THREE.Vector3((box.minX + box.maxX) / 2, 0, (box.minY + box.maxY) / 2);
  const corners = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]]
    .map(([x, z]) => new THREE.Vector3(x, 0, z));
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 4, 6000);
  let distance = Math.max(60, (box.maxX - box.minX) / (2 * t * aspect));
  for (let n = 0; n < 12; n++) {
    camera.position.copy(target).addScaledVector(EYE, distance);
    camera.lookAt(target); camera.updateMatrixWorld();
    const projected = corners.map(p => p.clone().project(camera));
    const xs = projected.map(p => p.x), ys = projected.map(p => p.y);
    const offsetX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const offsetY = (Math.max(...ys) + Math.min(...ys)) / 2;
    const spread = Math.max((Math.max(...xs) - Math.min(...xs)) / 2,
      (Math.max(...ys) - Math.min(...ys)) / 2);
    target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), offsetX * distance * t * aspect);
    target.z += -(offsetY * distance * t) / Math.sin(ELEV);
    distance = Math.max(60, distance * spread / 0.97);
  }
  return { target: [target.x, target.z], distance };
}

function BoxModel({ size, at, color, extra }: { size: [number, number, number]; at: [number, number, number]; color: string; extra?: THREE.MeshStandardMaterialParameters }) {
  return <mesh geometry={BOX} material={standard(color,extra)} position={at} scale={size} castShadow receiveShadow />;
}
function vehicleColor(plate:string){
  const colors=['#F8FAFC','#CBD5E1','#1E3A8A','#2563EB','#1F2937','#0EA5E9','#E5E7EB','#FBBF24','#94A3B8'];
  let hash=0;
  for(const ch of plate)hash=(hash*31+ch.charCodeAt(0))>>>0;
  return colors[hash%colors.length];
}
function TreeModel({ at, r, base = 0 }: { at: Point; r: number; base?: number }) {
  const tint = ['#2F6B3A', '#3B7D45', '#356F3E'][Math.abs(Math.round(at[0] + at[1])) % 3];
  return <group position={[at[0], base, at[1]]}>
    <mesh geometry={TRUNK} material={standard('#6B4F2E')} position={[0,2.2,0]} scale={[1,4.4,1]} castShadow />
    <mesh geometry={CANOPY} material={standard(tint,{flatShading:true,roughness:0.85})} position={[0,4.4+r*0.8,0]} scale={[r,r*0.95,r]} castShadow receiveShadow />
    <mesh geometry={CANOPY} material={standard('#4C9A55',{flatShading:true,roughness:0.85})} position={[-r*0.3,4.6+r*1.25,-r*0.2]} scale={r*0.55} castShadow />
  </group>;
}
function SharedGate({ data, onGate }: { data: ParkingMapData; onGate: () => void }) {
  const g = data.geometry.gate, online = data.gate?.gate_status === 'online' || data.gate?.gate_status === 'active';
  return <group position={[g.at[0],ASPHALT_TOP,g.at[1]]} rotation-y={-g.angle*DEG} onClick={onGate}>
    <BoxModel size={[9,9,7.5]} at={[0,4.5-ASPHALT_TOP,-22]} color="#F1F5F9" />
    <BoxModel size={[9.2,2.4,7.7]} at={[0,6,-22]} color="#1E3A8A" />
    <BoxModel size={[11,1.2,9.5]} at={[0,9.6-ASPHALT_TOP,-22]} color="#080677" />
    <BoxModel size={[1.4,4.2,1.4]} at={[6,2.9,-14]} color="#1E3A8A" />
    <BoxModel size={[1.5,1.2,1.5]} at={[6,4.6,-14]} color="#2563EB" />
    <BoxModel size={[2.4,7,2.4]} at={[0,3.5,-14]} color="#FACC15" />
    <mesh geometry={CANOPY} material={standard(online?'#22C55E':'#F59E0B')} position={[0,7.3,-14]} scale={0.7}/>
    {Array.from({length:8},(_,k)=><BoxModel key={k} size={[0.8,0.8,2.8]} at={[0,6.4,-11.8+2.8*k]} color={k%2?'#FFFFFF':'#DC2626'}/>)}
    {([[-5,-15],[9,-15],[-5,15],[9,15]] as Point[]).map(([u,v])=><BoxModel key={`${u}${v}`} size={[1.4,15,1.4]} at={[u,7.5,v]} color="#CBD5E1"/>)}
    <BoxModel size={[17,0.8,34]} at={[2,16,0]} color="#F1F5F9"/>
    <BoxModel size={[17.6,1.4,34.6]} at={[2,15,0]} color="#1E3A8A"/>
  </group>;
}

function CarModel({ slot }: { slot: MapSlot }) {
  const axis = slot.h! >= slot.w! ? slot.rotation + 90 : slot.rotation;
  const long = Math.max(slot.w!,slot.h!), short = Math.min(slot.w!,slot.h!);
  const L = Math.min(long*0.84,short*2.4), W = Math.min(short*0.72,L*0.48);
  const body=vehicleColor(slot.occupant?.plate_number||slot.slot_code);
  return <group position={[slot.x!,ASPHALT_TOP,slot.y!]} rotation-y={-axis*DEG}>
    {([[-0.3,-1],[0.3,-1],[-0.3,1],[0.3,1]] as Point[]).map(([u,v],k)=><mesh key={k} geometry={WHEEL} material={standard('#111827')} position={[u*L,1.25,v*(W/2-0.5)]} scale={[1.25,1.25,1.1]} castShadow/>)}
    <BoxModel size={[L,2.6,W]} at={[0,2.5,0]} color={body} extra={{metalness:0.45,roughness:0.35}}/>
    <BoxModel size={[L*0.96,0.5,W*0.96]} at={[0,1.15,0]} color="#1F2937"/>
    <BoxModel size={[L*0.54,2.2,W*0.86]} at={[-L*0.06,4.9,0]} color="#1E293B" extra={{metalness:0.6,roughness:0.15}}/>
    <BoxModel size={[L*0.4,0.45,W*0.78]} at={[-L*0.06,6.2,0]} color={body} extra={{metalness:0.45,roughness:0.35}}/>
    {[-0.3,0.3].map(v=><React.Fragment key={v}>
      <BoxModel size={[0.3,0.7,W*0.2]} at={[L/2,2.9,v*W]} color="#FEF3C7"/>
      <BoxModel size={[0.3,0.7,W*0.2]} at={[-L/2,2.9,v*W]} color="#DC2626"/>
    </React.Fragment>)}
  </group>;
}
function MotorcycleModel({ slot }: { slot: MapSlot }) {
  const axis = slot.h! >= slot.w! ? slot.rotation + 90 : slot.rotation;
  const long = Math.max(slot.w!,slot.h!),short = Math.min(slot.w!,slot.h!);
  const L = Math.min(long*0.78,11), W = Math.min(short*0.34,3);
  const color=vehicleColor(slot.occupant?.plate_number||slot.slot_code);
  return <group position={[slot.x!,ASPHALT_TOP,slot.y!]} rotation-y={-axis*DEG}>
    {[-0.36,0.36].map((q,i)=><mesh key={i} geometry={WHEEL} material={standard('#111827')} position={[q*L,1.35,0]} scale={[1.35,1.35,W*0.4]} castShadow/>)}
    <BoxModel size={[L*0.62,1.6,W*0.7]} at={[0,2.5,0]} color={color} extra={{metalness:0.4,roughness:0.35}}/>
    <BoxModel size={[L*0.36,0.7,W*0.62]} at={[-L*0.06,3.65,0]} color="#1F2937"/>
    <BoxModel size={[0.5,0.4,W*1.9]} at={[L*0.28,4.6,0]} color="#475569"/>
    <BoxModel size={[0.5,1.6,0.5]} at={[L*0.3,3.8,0]} color="#475569"/>
  </group>;
}
function MaintenanceCone({slot}:{slot:MapSlot}) {
  const deg=slot.h!>=slot.w!?slot.rotation+90:slot.rotation;
  const p=offset([slot.x!,slot.y!],deg,-Math.max(slot.w!,slot.h!)*0.3);
  return <group position={[p[0],ASPHALT_TOP,p[1]]}>
    <BoxModel size={[3,0.4,3]} at={[0,0.2,0]} color="#EA580C"/>
    <mesh geometry={CONE} material={standard('#F97316')} position={[0,2.4,0]} scale={[1.25,4,1.25]} castShadow/>
    <mesh geometry={CONE} material={standard('#FFFFFF')} position={[0,2.75,0]} scale={[0.86,1.1,0.86]}/>
  </group>;
}
function ParkingStall({ slot, selected, onSelect }: { slot: MapSlot; selected: boolean; onSelect: (slot: MapSlot) => void }) {
  const corners = useMemo(()=>bay(slot.x!,slot.y!,slot.w!-0.9,slot.h!-0.9,slot.rotation),[slot.x,slot.y,slot.w,slot.h,slot.rotation]);
  const geo = useMemo(()=>flat(corners,TINT),[corners]);
  useEffect(()=>()=>geo.dispose(),[geo]);
  const color = slot.status==='occupied'?'#EF4444':slot.status==='maintenance'?'#A3A9B3':'#22C55E';
  return <group>
    <mesh geometry={geo} onClick={(e)=>{e.stopPropagation();onSelect(slot);}}>
      <meshStandardMaterial color={selected?'#FACC15':color} transparent opacity={selected?0.85:slot.status==='maintenance'?0.88:slot.status==='occupied'?0.8:0.78}
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} depthWrite={false} roughness={0.85} side={THREE.DoubleSide}/>
    </mesh>
    {slot.status==='occupied' && slot.occupant && <group onClick={(e)=>{e.stopPropagation();onSelect(slot);}}>
      {slot.area_code==='MC'?<MotorcycleModel slot={slot}/>:<CarModel slot={slot}/>}</group>}
    {slot.status==='maintenance' && <group onClick={e=>{e.stopPropagation();onSelect(slot);}}><MaintenanceCone slot={slot}/></group>}
  </group>;
}

/** Actual Three.js geometry from the web, driven by live statuses. */
function SiteMesh({ data, area, selectedId, onSelect, onGate }: {
  data: ParkingMapData; area: Area; selectedId: number|null;
  onSelect:(slot:MapSlot)=>void; onGate:()=>void;
}) {
  // Avoid rebuilding hundreds of GPU objects every time the five-second
  // occupancy poll returns an equivalent copy of the map geometry.
  const geometrySignature=JSON.stringify(data.geometry);
  const g=useMemo(()=>data.geometry,[geometrySignature]);
  const paved = useMemo(()=>[...(g.connector?[g.connector.polygon]:[]),...g.areas.map(a=>a.polygon),g.road.polygon], [g]);
  const treesToDraw=useMemo(()=>trees(data),[g]);
  const slabs=useMemo(()=>({site:g.site?polygon(g.site.polygon,-4,0):null,
    road:paved.map(p=>polygon(p,-0.5,ASPHALT_TOP)),islands:(g.islands??[]).map(i=>polygon(i.polygon,ASPHALT_TOP,ASPHALT_TOP+0.9)),
    // Web ParkingLot3D explicitly paints the same yellow shared approach,
    // instead of turning the whole central junction into a different layout.
    approach:(g.circulation??[]).filter(c=>c.kind==='car_approach'||c.kind==='walkway')
      .map(c=>({kind:c.kind,geometry:flat(c.polygon,PAINT-0.03)}))}),[g,paved]);
  const paint=useMemo(()=>{
    const white=new PaintedGeometry(PAINT), faint=new PaintedGeometry(PAINT),yellow=new PaintedGeometry(PAINT),blue=new PaintedGeometry(PAINT+0.04);
    for(const lane of g.lanes){
      const pts=lane.reverse?[...lane.points].reverse():lane.points;
      if(pts.length<2)continue;
      if(lane.kind==='to_area') {
        blue.dashed([...pts.slice(0,-1),before(pts,7)],1.5,3,2).poly(arrow(before(pts,7),pts[pts.length-1],1.5,5.5,5.5));
        continue;
      }
      if(lane.kind==='lane')faint.dashed(pts,0.6,4,3);
      white.poly(arrow(before(pts,9),pts[pts.length-1]));
    }
    for(const a of g.areas)faint.dashed(a.polygon,0.55,5,2.5,true);
    // The web version marks long internal driving lanes in both directions.
    for(const l of g.lanes){
      if(l.kind!=='lane'||l.points.length<2)continue;
      const from=l.points[0],to=l.points[l.points.length-1],length=Math.hypot(to[0]-from[0],to[1]-from[1]);
      if(length<=60)continue;
      const middle:Point=[(from[0]+to[0])/2,(from[1]+to[1])/2];
      white.poly(arrow([middle[0]-(to[0]-from[0])/length*9,middle[1]-(to[1]-from[1])/length*9],middle));
    }
    yellow.outline(g.road.polygon,0.6);
    return {white:white.build(),faint:faint.build(),yellow:yellow.build(),blue:blue.build()};
  },[g]);
  const slots=data.slots.filter(s=>s.placed&&s.x!==null&&s.y!==null&&s.w!==null&&s.h!==null&&s.w>0&&s.h>0);
  const outlines=useMemo(()=>{
    const p=new PaintedGeometry(PAINT);
    for(const s of slots)p.outline(bay(s.x!,s.y!,s.w!,s.h!,s.rotation),0.5);
    return p.build();
  },[slots.map(s=>`${s.slot_id}:${s.x}:${s.y}:${s.w}:${s.h}:${s.rotation}`).join('|')]);
  useEffect(()=>()=>{slabs.site?.dispose();slabs.road.forEach(x=>x.dispose());slabs.islands.forEach(x=>x.dispose());slabs.approach.forEach(x=>x.geometry.dispose());},[slabs]);
  useEffect(()=>()=>{Object.values(paint).forEach(x=>x.dispose());},[paint]);
  useEffect(()=>()=>outlines.dispose(),[outlines]);
  const sun=useMemo(()=>{
    const area=homeBox(data,'ALL');
    const c=new THREE.DirectionalLight('#FFF7E8',2.4);
    const x=(area.minX+area.maxX)/2, z=(area.minY+area.maxY)/2;
    c.position.set(x-260,520,z-300);c.target.position.set(x,0,z);
    c.castShadow=true;c.shadow.mapSize.set(1024,1024);
    Object.assign(c.shadow.camera,{left:-460,right:460,top:460,bottom:-460,near:50,far:1600});
    c.shadow.bias=-0.0004;c.shadow.normalBias=0.6;c.shadow.radius=3;
    return c;
  },[g]);
  return <>
    <hemisphereLight args={['#F1F5FF','#5B7F43',0.9]}/><ambientLight intensity={0.25}/>
    <primitive object={sun}/><primitive object={sun.target}/>
    {slabs.site&&<mesh geometry={slabs.site} material={[turfTop,standard('#5B7F43')]} receiveShadow/>}
    {slabs.road.map((geo,i)=><mesh key={`pave-${i}`} geometry={geo} material={[asphaltTop,standard('#C7CED8')]} receiveShadow/>)}
    <mesh geometry={paint.white} material={painted('#F8FAFC',0.95)}/>
    <mesh geometry={paint.faint} material={painted('#F8FAFC',0.5)}/>
    <mesh geometry={paint.yellow} material={painted('#FACC15')}/>
    <mesh geometry={paint.blue} material={painted('#2563EB')}/>
    {slabs.approach.map((c,i)=><mesh key={`approach-${i}`} geometry={c.geometry}
      material={painted(c.kind==='walkway'?'#93C5FD':'#EAB308',c.kind==='walkway'?1:0.6)}/>)}
    {slabs.islands.map((geo,i)=><mesh key={`island-${i}`} geometry={geo} material={[turfTop,standard('#C7CED8')]} receiveShadow/>)}
    <mesh geometry={outlines} material={painted('#FFFFFF')}/>
    {slots.map(s=><ParkingStall key={s.slot_id} slot={s} selected={selectedId===s.slot_id} onSelect={onSelect}/>)}
    {treesToDraw.map((t,i)=><TreeModel key={`tree-${i}`} at={t.at} r={t.r}/>)}
    {(g.islands??[]).map((i,k)=>{
      const centre=i.polygon.reduce<Point>((v,p)=>[v[0]+p[0]/i.polygon.length,v[1]+p[1]/i.polygon.length],[0,0]);
      return <TreeModel key={`islandtree-${k}`} at={centre} r={4.4} base={ASPHALT_TOP+0.9}/>;
    })}
    <SharedGate data={data} onGate={onGate}/>
  </>;
}

function PerspectiveRig({ pose }: { pose: CameraPose }) {
  const {camera,invalidate}=useThree();
  useEffect(()=>{
    const target=new THREE.Vector3(pose.target[0],0,pose.target[1]);
    camera.position.copy(target).addScaledVector(EYE,pose.distance);
    camera.lookAt(target);camera.updateMatrixWorld();invalidate();
  },[pose,camera,invalidate]);
  return null;
}

type Props={data:ParkingMapData;area:Area;selectedId:number|null;onSelect:(s:MapSlot)=>void;onGate:()=>void};
function Labels({ data, pose, width, height, area, onGate, onSelect }: {
  data:ParkingMapData;pose:CameraPose;width:number;height:number;area:Area;onGate:()=>void;onSelect:(slot:MapSlot)=>void;
}) {
  const cam=useMemo(()=>{
    const camera=new THREE.PerspectiveCamera(FOV,width/height,4,6000);
    const target=new THREE.Vector3(pose.target[0],0,pose.target[1]);
    camera.position.copy(target).addScaledVector(EYE,pose.distance);camera.lookAt(target);camera.updateMatrixWorld();
    return camera;
  },[pose,width,height]);
  const screen=(x:number,y:number,z:number):[number,number]=>{
    const p=new THREE.Vector3(x,y,z).project(cam);
    return [(p.x+1)*width/2,(1-p.y)*height/2];
  };
  const signScale=Math.max(0.62,Math.min(1.4,(width/850)*(fitPerspective(homeBox(data,area),width,height).distance/pose.distance)));
  return <Svg pointerEvents="box-none" width={width} height={height} style={{position:'absolute',left:0,top:0}}>
    {/* Every web-proposed slot has a projected footprint in the native SVG
        layer as well as a Three.js mesh. This prevents EXGL driver quirks
        from making bays appear missing, without introducing new positions. */}
    {data.slots.filter(s=>s.placed&&s.x!==null&&s.y!==null&&s.w!==null&&s.h!==null).map(s=>{
      const footprint = bay(s.x!,s.y!,s.w!,s.h!,s.rotation).map(p=>screen(p[0],TINT+0.08,p[1]));
      const at=screen(s.x!,ASPHALT_TOP+(s.status==='occupied'?s.area_code==='MC'?10:13:0.4),s.y!);
      // Do not cull from a centre-only test: long car bays can cross the edge.
      if(footprint.every(p => p[0]<-30) || footprint.every(p=>p[0]>width+30) ||
         footprint.every(p=>p[1]<-30) || footprint.every(p=>p[1]>height+30))return null;
      const size=Math.max(5,Math.min(17,500/pose.distance*Math.min(s.w!,s.h!)));
      const label=String(Number(s.slot_code.split('-').pop()??s.slot_code));
      const polygonPoints=footprint.map(p=>`${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
      const fill = s.status==='maintenance'?'#9CA3AF':s.status==='occupied'?'#EF4444':'#22C55E';
      return <G key={s.slot_id}>
        <Polygon points={polygonPoints} fill={fill} fillOpacity={0.53} stroke="#FFFFFF" strokeWidth={Math.max(0.42,Math.min(1.0,width/750))} onPress={()=>onSelect(s)}/>
        {s.status==='occupied'&&<Rect x={at[0]-size*0.7} y={at[1]-size} width={size*1.4} height={size*1.3} rx={2} fill="#DC2626" stroke="#FFFFFF" strokeWidth={0.5}/>}
        <SvgText x={at[0]} y={at[1]} fontSize={size} fill="#FFFFFF" fontWeight="bold" textAnchor="middle" stroke="#27313E" strokeWidth={0.15}>{label}</SvgText>
      </G>;
    })}
    {data.geometry.areas.filter(a=>area==='ALL'||area===a.area).map(a=>{
      const pos=a.sign_at??a.label_at;
      const [x,y]=screen(pos[0],19,pos[1]);
      if(x<-120||x>width+120||y<-40||y>height+40)return null;
      const title=a.area==='MC'?'MOTORCYCLE PARKING':'CAR PARKING';
      const info=data.geometry.measurement_basis?.inventory;
      const proposed=info?`${a.area==='MC'?info.motorcycle_drawn:info.car_drawn} PROPOSED BAYS`:'';
      const w=Math.max(title.length*5.6,proposed.length*3.6)+30;
      return <G key={`sign-${a.area}`} pointerEvents="none" transform={`translate(${x} ${y}) scale(${signScale})`}>
        <Line x1={0} y1={0} x2={0} y2={18} stroke="#64748B" strokeWidth={1.7}/>
        <Rect x={-w/2} y={-23} width={w} height={28} rx={4} fill="#1D4ED8" stroke="#FFFFFF" strokeWidth={1}/>
        <Rect x={-w/2+6} y={-17} width={17} height={16} rx={2} fill="#FFFFFF"/>
        <SvgText x={-w/2+14.5} y={-5} fill="#1D4ED8" textAnchor="middle" fontSize={12} fontWeight="bold">P</SvgText>
        <SvgText x={-w/2+28} y={-12} fontSize={9} fontWeight="bold" fill="#FFFFFF">{title}</SvgText>
        <SvgText x={-w/2+28} y={-3} fontSize={6.5} fill="#DBEAFE">{proposed}</SvgText>
      </G>;
    })}
    {(()=>{
      const gate=data.geometry.gate;
      const [x,y]=screen(gate.at[0]+14,36,gate.at[1]-12);
      return <G onPress={onGate} transform={`translate(${x} ${y}) scale(${signScale})`}>
        <Rect x={-8} y={-23} width={195} height={34} rx={5} fill="#080677" stroke="#FFFFFF" strokeWidth={1}/>
        <SvgText x={0} y={-10} fill="#FFFFFF" fontWeight="bold" fontSize={12}>{gate.label}</SvgText>
        <SvgText x={0} y={1} fill="#BFDBFE" fontSize={8}>Shared gate · RFID / Visitor QR</SvgText>
      </G>;
    })()}
    {(()=>{
      const road=data.geometry.road;
      const [x,y]=screen(road.label_at[0],PAINT+0.2,road.label_at[1]);
      const scale=Math.max(5,Math.min(17,width/60*pose.distance/Math.max(1,fitPerspective(homeBox(data,area),width,height).distance)));
      return <G pointerEvents="none"><SvgText x={x} y={y} textAnchor="middle" fill="#FFFFFF" stroke="#1E293B" strokeWidth={0.2} fontSize={scale} fontWeight="bold">{road.label}</SvgText></G>;
    })()}
    {data.geometry.circulation_labels?.map((label,i)=>{
      const [x,y]=screen(label.at[0],PAINT+0.2,label.at[1]);
      return <SvgText key={`road-note-${i}`} pointerEvents="none" x={x} y={y} textAnchor="middle"
        fill="#FFFFFF" stroke="#1E293B" strokeWidth={0.25}
        fontSize={Math.max(7,Math.min(13,width/85))} fontWeight="bold">{label.text}</SvgText>;
    })}
  </Svg>;
}

class Native3DErrorBoundary extends Component<{children:React.ReactNode;fallback:React.ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

export default function ParkingWeb3DNative({data,area,selectedId,onSelect,onGate}:Props){
  // The web view is 2.45:1. When the Android phone is rotated, use that
  // exact wide framing. Portrait keeps enough height for touch gestures.
  const [width,setWidth]=useState(350);
  const height=width>600?Math.max(280,Math.round(width/2.45)):Math.max(280,Math.min(440,width*0.96));
  const boundsKey=JSON.stringify({box:homeBox(data,area),area,width,height});
  const full=useMemo(()=>fitPerspective(homeBox(data,area),width,height),[boundsKey]);
  const [pose,setPose]=useState<CameraPose>(full);
  const poseRef=useRef(pose);poseRef.current=pose;
  const dragStart=useRef(pose);
  const pinchDistance=useRef<number|null>(null);
  useEffect(()=>setPose(full),[full]);
  const zoom=(factor:number)=>setPose(p=>({...p,distance:Math.max(45,Math.min(2200,p.distance/factor))}));
  const responder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>false,
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>4||Math.abs(g.dy)>4||g.numberActiveTouches>1,
    onPanResponderGrant:()=>{dragStart.current=poseRef.current;pinchDistance.current=null;},
    onPanResponderMove:(event,gesture)=>{
      const touches=event.nativeEvent.touches;
      if(touches.length>1){
        const d=Math.hypot(touches[0].pageX-touches[1].pageX,touches[0].pageY-touches[1].pageY);
        if(pinchDistance.current===null){pinchDistance.current=d;dragStart.current=poseRef.current;return;}
        setPose({...dragStart.current,distance:Math.max(45,Math.min(2200,dragStart.current.distance*pinchDistance.current/d))});
      } else if(pinchDistance.current===null){
        const p=dragStart.current;
        const worldPerPixel=2*p.distance*Math.tan(FOV*DEG/2)/height;
        setPose({distance:p.distance,target:[p.target[0]-gesture.dx*worldPerPixel,
          p.target[1]-gesture.dy*worldPerPixel/Math.sin(ELEV)]});
      }
    },
    onPanResponderRelease:()=>{pinchDistance.current=null;},
    onPanResponderTerminate:()=>{pinchDistance.current=null;},
  }),[height]);
  return <View style={{borderWidth:1,borderColor:C.slate200,borderRadius:16,overflow:'hidden',backgroundColor:'#E6EDF5'}}>
    <View style={{width:'100%',height,backgroundColor:'#E6EDF5'}} onLayout={e=>setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
      <Native3DErrorBoundary fallback={<View style={{padding:15}}><T s={12} c={C.red700}>This device could not create the native 3D graphics context. Try restarting Expo Go; the 2D plan remains available.</T></View>}>
        <Canvas key="pass-web-three" camera={{fov:FOV,near:4,far:6000,position:[350,700,500]}} shadows="percentage" frameloop="demand" gl={{antialias:true}}>
          <PerspectiveRig pose={pose}/>
          <SiteMesh data={data} area={area} selectedId={selectedId} onSelect={onSelect} onGate={onGate}/>
        </Canvas>
      </Native3DErrorBoundary>
      <Labels data={data} pose={pose} width={width} height={height} area={area} onGate={onGate} onSelect={onSelect}/>
    </View>
    <View style={{padding:8,flexDirection:'row',alignItems:'center',gap:6}}>
      <T s={11} c={C.slate500} style={{flex:1}}>Web 3D scene · Drag / pinch · Tap a slot</T>
      {([ {Icon:ZoomIn,label:'Zoom in',action:()=>zoom(1.4)},
        {Icon:ZoomOut,label:'Zoom out',action:()=>zoom(1/1.4)},
        {Icon:Maximize2,label:'Whole site',action:()=>setPose(full)}] as const).map(({Icon,label,action})=>
        <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{padding:8,borderRadius:9,backgroundColor:C.blue50}}>
          <Icon color={C.royal} size={17}/></Pressable>)}
    </View>
  </View>;
}
