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
  it('serializes statuses as repeated statuses[] params', async () => {
    await getOrders({ statuses: ['CREATED', 'PROCESSING'] });
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).toContain('statuses[]=CREATED');
    expect(url).toContain('statuses[]=PROCESSING');
  });

  it('includes limit param when provided', async () => {
    await getOrders({ limit: 100 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=100');
  });

  it('omits statuses from URL when not provided', async () => {
    await getOrders({ cashShiftId: 'cs1' });
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).not.toContain('statuses');
  });

  it('includes cashShiftId and orderNumber in URL', async () => {
    await getOrders({ cashShiftId: 'cs1', orderNumber: 42 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('cashShiftId=cs1');
    expect(url).toContain('orderNumber=42');
  });
});
