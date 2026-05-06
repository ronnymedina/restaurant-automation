import { renderHook, act } from '@testing-library/react'
import { useViewport } from './useViewport'

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

test('returns isSidebarMode=false when width < 1024', () => {
  setWindowWidth(768)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(false)
})

test('returns isSidebarMode=true when width >= 1024', () => {
  setWindowWidth(1024)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(true)
})

test('updates isSidebarMode when window is resized to wide', () => {
  setWindowWidth(768)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(false)

  act(() => {
    setWindowWidth(1280)
    window.dispatchEvent(new Event('resize'))
  })

  expect(result.current.isSidebarMode).toBe(true)
})

test('updates isSidebarMode when window is resized to narrow', () => {
  setWindowWidth(1280)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(true)

  act(() => {
    setWindowWidth(768)
    window.dispatchEvent(new Event('resize'))
  })

  expect(result.current.isSidebarMode).toBe(false)
})
