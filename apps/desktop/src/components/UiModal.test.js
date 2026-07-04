import { describe, it, expect } from 'vitest';
import { mount, config } from '@vue/test-utils';
import UiModal from './UiModal.vue';

// Stub Teleport/Transition for jsdom compatibility
config.global.stubs = config.global.stubs || {};
config.global.stubs.Teleport = { template: '<div><slot /></div>' };
config.global.stubs.Transition = { template: '<div><slot /></div>' };

describe('UiModal', () => {
  it('renders nothing when visible=false', () => {
    const w = mount(UiModal, { props: { visible: false } });
    expect(w.find('.ui-modal-overlay').exists()).toBe(false);
  });

  it('renders overlay when visible=true', () => {
    const w = mount(UiModal, { props: { visible: true } });
    expect(w.find('.ui-modal-overlay').exists()).toBe(true);
    expect(w.find('.ui-modal').exists()).toBe(true);
  });

  it('displays title when provided', () => {
    const w = mount(UiModal, { props: { visible: true, title: 'Test Title' } });
    expect(w.find('.ui-modal-title').text()).toBe('Test Title');
  });

  it('renders default slot content', () => {
    const w = mount(UiModal, {
      props: { visible: true },
      slots: { default: 'Modal Body Content' },
    });
    expect(w.find('.ui-modal-body').text()).toContain('Modal Body Content');
  });

  it('renders footer slot when provided', () => {
    const w = mount(UiModal, {
      props: { visible: true },
      slots: { footer: '<button>OK</button>' },
    });
    expect(w.find('.ui-modal-footer').exists()).toBe(true);
    expect(w.find('.ui-modal-footer button').text()).toBe('OK');
  });

  it('does not render footer when no slot', () => {
    const w = mount(UiModal, { props: { visible: true } });
    expect(w.find('.ui-modal-footer').exists()).toBe(false);
  });

  it('emits close on overlay click', async () => {
    const w = mount(UiModal, { props: { visible: true } });
    await w.find('.ui-modal-overlay').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('emits close on X button click', async () => {
    const w = mount(UiModal, { props: { visible: true, title: 'Title' } });
    await w.find('.ui-modal-close').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('does not emit close when clicking modal body', async () => {
    const w = mount(UiModal, { props: { visible: true } });
    await w.find('.ui-modal').trigger('click');
    expect(w.emitted('close')).toBeFalsy();
  });

  it('applies size class', () => {
    const sizes = ['sm', 'md', 'lg', 'xl'];
    sizes.forEach(size => {
      const w = mount(UiModal, { props: { visible: true, size } });
      expect(w.find('.ui-modal').classes()).toContain('ui-modal-' + size);
    });
  });

  it('applies custom width style', () => {
    const w = mount(UiModal, { props: { visible: true, width: '500px' } });
    expect(w.find('.ui-modal').attributes('style')).toMatch(/500px/);
  });
});
