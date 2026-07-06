import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiCard from './UiCard.vue';

describe('UiCard', () => {
  it('renders slot content', () => {
    const w = mount(UiCard, { slots: { default: 'Card Body' } });
    expect(w.text()).toContain('Card Body');
  });

  it('applies default classes', () => {
    const w = mount(UiCard);
    expect(w.classes()).toContain('ui-card');
    expect(w.classes()).toContain('ui-card-default');
  });

  it('applies variant class', () => {
    const variants = ['default', 'elevated', 'bordered', 'flat'];
    for (const v of variants) {
      const w = mount(UiCard, { props: { variant: v } });
      expect(w.classes()).toContain('ui-card-' + v);
    }
  });

  it('applies padding from prop', () => {
    const map = { sm: '12', md: '16', lg: '20', xl: '24' };
    for (const [key, val] of Object.entries(map)) {
      const w = mount(UiCard, { props: { padding: key } });
      expect(w.attributes('style')).toContain('padding: ' + val + 'px');
    }
  });

  it('falls back to lg padding for unknown value', () => {
    const w = mount(UiCard, { props: { padding: 'xxl' } });
    expect(w.attributes('style')).toContain('padding: 20px');
  });

  it('displays title when provided', () => {
    const w = mount(UiCard, { props: { title: 'Card Title' } });
    expect(w.find('.ui-card-title').text()).toBe('Card Title');
  });

  it('renders header slot', () => {
    const w = mount(UiCard, {
      slots: { header: '<button>HeaderBtn</button>' },
    });
    expect(w.find('.ui-card-header').exists()).toBe(true);
    expect(w.find('.ui-card-header button').text()).toBe('HeaderBtn');
  });

  it('renders footer slot', () => {
    const w = mount(UiCard, {
      slots: { footer: '<button>FooterBtn</button>' },
    });
    expect(w.find('.ui-card-footer').exists()).toBe(true);
    expect(w.find('.ui-card-footer button').text()).toBe('FooterBtn');
  });

  it('does not render footer when no slot and no title', () => {
    const w = mount(UiCard);
    expect(w.find('.ui-card-footer').exists()).toBe(false);
  });
});
