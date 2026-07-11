import { render, screen } from '@testing-library/react';
import Providers from './Providers';

test('renders children inside QueryClientProvider', () => {
  render(<Providers><div>test-child</div></Providers>);
  expect(screen.getByText('test-child')).toBeInTheDocument();
});
