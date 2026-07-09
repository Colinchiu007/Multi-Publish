import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// 组件已 import { intelligenceGetOptimalTime } from '@/api/publisher'
// 必须用 vi.mock 拦截 ESM import，globalThis 赋值无法拦截
// 工厂内创建 vi.fn()，通过 import 拿引用（vi.mock 是 hoisted，不能引用外部变量）
vi.mock('@/api/publisher', () => ({
  intelligenceGetOptimalTime: vi.fn(),
}));

import { intelligenceGetOptimalTime } from '@/api/publisher';
import OptimalTimeTip from './OptimalTimeTip.vue';

describe('OptimalTimeTip', () => {
  beforeEach(() => {
    vi.mocked(intelligenceGetOptimalTime).mockReset();
  });

  it('renders initial state (no keyword)', () => {
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    expect(w.text()).toMatch(/输入更长|最佳发布时间/);
  });

  it('renders short keyword prompt', () => {
    const w = mount(OptimalTimeTip, { props: { keyword: 'a' } });
    expect(w.text()).toMatch(/输入更长|最佳发布时间/);
  });

  it('watcher triggers on keyword prop change', async () => {
    vi.mocked(intelligenceGetOptimalTime).mockResolvedValue({ recommendation: { topHours: [] } });
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    await w.setProps({ keyword: 'test' });
    await new Promise(r => setTimeout(r, 700));
    expect(intelligenceGetOptimalTime).toHaveBeenCalled();
  });

  it('shows error when API fails', async () => {
    vi.mocked(intelligenceGetOptimalTime).mockRejectedValue(new Error('err'));
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    await w.setProps({ keyword: 'test' });
    await new Promise(r => setTimeout(r, 700));
    expect(w.text()).toMatch(/err|失败/);
  });

  it('shows results via prop change', async () => {
    vi.mocked(intelligenceGetOptimalTime).mockResolvedValue({
      recommendation: { topHours: [{ hourUTC: 2, hourCN: 10, score: 85 }], bestHourUTC: 2, bestHourCN: 10, dataPoints: 100 },
      bySource: { douyin: 60 },
    });
    const w = mount(OptimalTimeTip, { props: { keyword: '' } });
    await w.setProps({ keyword: 'test' });
    await new Promise(r => setTimeout(r, 700));
    expect(w.text()).toContain('10:00');
  });
});
