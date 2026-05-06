import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update within the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } },
    );

    rerender({ value: 'world', delay: 300 });
    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current).toBe('hello');
  });

  it('updates after the delay has passed', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } },
    );

    rerender({ value: 'world', delay: 300 });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe('world');
  });

  it('resets the timer if value changes before delay completes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } },
    );

    rerender({ value: 'wor', delay: 300 });
    act(() => { vi.advanceTimersByTime(150); });
    rerender({ value: 'world', delay: 300 });
    act(() => { vi.advanceTimersByTime(150); });

    expect(result.current).toBe('hello');

    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('world');
  });
});
