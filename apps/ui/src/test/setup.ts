import '@testing-library/jest-dom';
import { act } from '@testing-library/react';

const originalDispatchEvent = window.dispatchEvent.bind(window);
window.dispatchEvent = (event: Event) => {
  let result: boolean = false;
  act(() => {
    result = originalDispatchEvent(event);
  });
  return result;
};
