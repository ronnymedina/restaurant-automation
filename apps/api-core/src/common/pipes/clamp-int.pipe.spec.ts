import { ClampIntPipe } from './clamp-int.pipe';

describe('ClampIntPipe', () => {
  let pipe: ClampIntPipe;

  beforeEach(() => {
    pipe = new ClampIntPipe(1, 100);
  });

  it('passes through a value within bounds', () => {
    expect(pipe.transform(50)).toBe(50);
  });

  it('clamps values above max to max', () => {
    expect(pipe.transform(500)).toBe(100);
  });

  it('clamps values below min to min', () => {
    expect(pipe.transform(0)).toBe(1);
  });

  it('accepts the max boundary value', () => {
    expect(pipe.transform(100)).toBe(100);
  });

  it('accepts the min boundary value', () => {
    expect(pipe.transform(1)).toBe(1);
  });
});
