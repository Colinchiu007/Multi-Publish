import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import OptimalTimeTip from './OptimalTimeTip.vue';

var mockGet = vi.fn();
globalThis.intelligenceGetOptimalTime = mockGet;

describe('OptimalTimeTip', () => {
  it('renders initial state (no keyword)', () => {
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    expect(w.text()).toMatch(/输入更长|最佳发布时间/);
  });

  it('renders short keyword prompt', () => {
    const w = mount(OptimalTimeTip, { props: { keyword: 'a' } });
    expect(w.text()).toMatch(/输入更长|最佳发布时间/);
  });

  it('watcher triggers on keyword prop change', async () => {
    mockGet.mockResolvedValue({ recommendation: { topHours: [] } });
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    await w.setProps({ keyword: 'test' });
    await new Promise(r => setTimeout(r, 700));
    expect(mockGet).toHaveBeenCalled();
  });

  it('shows error when API fails', async () => {
    mockGet.mockRejectedValue(new Error('err'));
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    await w.setProps({ keyword: 'test' });
    await new Promise(r => setTimeout(r, 700));
    expect(w.text()).toMatch(/err|失败/);
  });

  it('shows results via prop change', async () => {
    mockGet.mockResolvedValue({
      recommendation: { topHours: [{ hourUTC: 2, hourCN: 10, score: 85 }], bestHourUTC: 2, bestHourCN: 10, dataPoints: 100 },
      bySource: { douyin: 60 },
    });
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    await w.setProps({ keyword: 'test' });
    await new Promise(r => setTimeout(r, 700));
    expect(w.text()).toContain('10:00');
  });
});
