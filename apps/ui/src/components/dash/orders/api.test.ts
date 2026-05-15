import { getOrders } from './api';
import { apiFetch } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }),
}));

const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

describe('getOrders', () => {
  it('serializes statuses as repeated statuses params', async () => {
    await getOrders({ statuses: ['CREATED', 'PROCESSING'] });
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).toContain('statuses=CREATED');
    expect(url).toContain('statuses=PROCESSING');
    expect(url).not.toContain('statuses[]=');
  });

  it('includes limit param when provided', async () => {
    await getOrders({ limit: 100 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=100');
  });

  it('omits statuses from URL when not provided', async () => {
    await getOrders({});
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).not.toContain('statuses');
  });

  it('includes orderNumber in URL when provided', async () => {
    await getOrders({ orderNumber: 42 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('orderNumber=42');
  });

  it('does not include cashShiftId in URL', async () => {
    await getOrders({ orderNumber: 1 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('cashShiftId');
  });
});
