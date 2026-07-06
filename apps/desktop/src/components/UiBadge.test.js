import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiBadge from './UiBadge.vue';

describe('UiBadge', () => {
  it('renders slot content', () => {
    const w = mount(UiBadge, { slots: { default: 'Badge Text' } });
    expect(w.text()).toContain('Badge Text');
  });

  it('applies default classes', () => {
    const w = mount(UiBadge, { slots: { default: 'Default' } });
    expect(w.classes()).toContain('ui-badge');
    expect(w.classes()).toContain('ui-badge-default');
    expect(w.classes()).toContain('ui-badge-md');
  });

  it('applies variant class', () => {
    const variants = ['default', 'primary', 'success', 'warning', 'error'];
    for (const v of variants) {
      const w = mount(UiBadge, { props: { variant: v }, slots: { default: v } });
      expect(w.classes()).toContain('ui-badge-' + v);
    }
  });

  it('applies size class', () => {
    const sizes = ['sm', 'md', 'lg'];
    for (const s of sizes) {
      const w = mount(UiBadge, { props: { size: s }, slots: { default: s } });
      expect(w.classes()).toContain('ui-badge-' + s);
    }
  });
});
