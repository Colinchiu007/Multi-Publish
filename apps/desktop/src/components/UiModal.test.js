import { describe, it, expect, vi } from 'vitest';
import { mount, config } from '@vue/test-utils';
import { nextTick } from 'vue';
import fs from 'node:fs';
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

  it('does not emit close from the overlay when closeOnOverlay=false', async () => {
    const w = mount(UiModal, { props: { visible: true, closeOnOverlay: false } });
    await w.find('.ui-modal-overlay').trigger('click');
    expect(w.emitted('close')).toBeFalsy();
  });

  it('does not emit close from Escape when closeOnEsc=false', () => {
    const w = mount(UiModal, { props: { visible: true, closeOnEsc: false } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toBeFalsy();
  });

  it('progress variant ignores Escape even when the generic closeOnEsc option is enabled', () => {
    const w = mount(UiModal, {
      props: { visible: true, variant: 'progress', closeOnEsc: true },
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toBeFalsy();
  });

  it('emits close from Escape only while closeOnEsc and visible are enabled', async () => {
    const w = mount(UiModal, { props: { visible: true, closeOnEsc: true } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toHaveLength(1);

    await w.setProps({ visible: false });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('emits close on X button click', async () => {
    const w = mount(UiModal, { props: { visible: true, title: 'Title' } });
    await w.find('.ui-modal-close').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
    expect(w.find('.ui-modal-close').attributes('type')).toBe('button');
    expect(w.find('.ui-modal-close').attributes('aria-label')).toBe('Close');
    expect(w.find('.ui-modal-close').attributes('data-testid')).toBe('ui-modal-close');
  });

  it('keeps the close button available when overlay and Escape closing are disabled', async () => {
    const w = mount(UiModal, {
      props: { visible: true, closeOnOverlay: false, closeOnEsc: false, closeDisabled: false },
    });
    await w.find('.ui-modal-close').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('supports the progress variant and a disabled close button for manual checkpoints', () => {
    const w = mount(UiModal, {
      props: { visible: true, variant: 'progress', closeDisabled: true },
    });
    expect(w.find('.ui-modal-overlay').classes()).toContain('ui-modal-overlay-progress');
    expect(w.find('.ui-modal').classes()).toContain('ui-modal-progress');
    expect(w.find('.ui-modal-close').attributes('disabled')).toBeDefined();
    expect(w.find('.ui-modal-close').attributes('aria-disabled')).toBe('true');
  });

  it('keeps focus inside the modal container when a progress close button is disabled', async () => {
    const w = mount(UiModal, {
      props: { visible: false, variant: 'progress', closeDisabled: true },
      global: { stubs: { Teleport: false, Transition: false } },
    });
    const trigger = document.createElement('button');
    trigger.setAttribute('data-testid', 'outside-progress-trigger');
    document.body.appendChild(trigger);
    trigger.focus();
    await w.setProps({ visible: true });
    await nextTick();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('outside-progress-trigger');
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

  // 回归保护（2026-09-05 进度弹窗露缝 bug）：
  // .ui-modal-body 是 .stages-sticky-header（position: sticky; top: 0）的滚动容器，
  // CSS sticky 约束矩形会被滚动容器自身的 padding 收缩——progress 变体若保留
  // padding-top，粘性进度条只能停在距 body 顶部 padding-top 处，向上滚出的阶段
  // 内容会先经过这条无遮盖的缝露出来（小窗口下尤其明显，标题和进度条之间漏出底层文字）。
  // 契约：progress 变体的 body 不得设置非零 padding-top，保证粘性进度条紧贴弹窗标题区。
  it('progress variant body keeps zero top padding so the sticky progress header stays flush with the modal title', () => {
    const source = fs.readFileSync('./src/components/UiModal.vue', 'utf8');
    const rule = source.match(/\.ui-modal-progress \.ui-modal-body\s*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    const top = rule[1].match(/padding-top:\s*([^;]+);/);
    if (top) expect(top[1].trim()).toBe('0');
  });
});

describe('UiModal real Teleport lifecycle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts progress content in document.body and removes it after visible becomes false', async () => {
    const w = mount(UiModal, {
      props: { visible: true, variant: 'progress', testId: 'real-progress-modal' },
      slots: { default: '<p data-testid="real-modal-content">Progress content</p>' },
      global: { stubs: { Teleport: false, Transition: false } },
    });

    await nextTick();
    expect(document.body.querySelector('[data-testid="real-progress-modal"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="real-modal-content"]')?.textContent).toContain('Progress content');

    await w.setProps({ visible: false });
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="real-progress-modal"]')).toBeNull();
    }, { timeout: 1000 });
    w.unmount();
  });

  it('removes the Escape listener when an enabled dialog is unmounted', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const w = mount(UiModal, {
      props: { visible: true, closeOnEsc: true },
      global: { stubs: { Teleport: false, Transition: false } },
    });

    await nextTick();
    w.unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
