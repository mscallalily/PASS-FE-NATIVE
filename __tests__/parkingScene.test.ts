import { project3D, slotRect } from '../src/components/ParkingSceneNative';

describe('web-parity architectural parking geometry', () => {
  it('uses the same 52-degree elevated orthographic camera as the web SVG fallback', () => {
    const [x, y] = project3D([120, 80], 6);
    expect(x).toBe(120);
    expect(y).toBeCloseTo(80 * Math.sin(52 * Math.PI / 180) - 6 * Math.cos(52 * Math.PI / 180));
  });

  it('uses the real coordinates and rotations instead of inventing new mobile slot positions', () => {
    expect(slotRect(50, 70, 10, 20, 0)).toEqual([
      [45, 60], [55, 60], [55, 80], [45, 80],
    ]);
    const rotated = slotRect(50, 70, 10, 20, 90);
    expect(rotated[0][0]).toBeCloseTo(60);
    expect(rotated[0][1]).toBeCloseTo(65);
    expect(rotated[2][0]).toBeCloseTo(40);
    expect(rotated[2][1]).toBeCloseTo(75);
  });
});
