import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiInput from './UiInput.vue';

describe('UiInput', () => {
  it('renders input element by default', () => {
    const w = mount(UiInput);
    expect(w.find('input').exists()).toBe(true);
  });

  it('renders textarea when type is textarea', () => {
    const w = mount(UiInput, { props: { type: 'textarea' } });
    expect(w.find('textarea').exists()).toBe(true);
    expect(w.find('input').exists()).toBe(false);
  });

  it('renders label when provided', () => {
    const w = mount(UiInput, { props: { label: '用户名' } });
    expect(w.find('.ui-input-label').text()).toBe('用户名');
  });

  it('does not render label when not provided', () => {
    const w = mount(UiInput);
    expect(w.find('.ui-input-label').exists()).toBe(false);
  });

  it('renders hint when provided', () => {
    const w = mount(UiInput, { props: { hint: '请输入用户名' } });
    expect(w.find('.ui-input-hint').text()).toBe('请输入用户名');
  });

  it('sets placeholder on input', () => {
    const w = mount(UiInput, { props: { placeholder: '请输入' } });
    expect(w.find('input').attributes('placeholder')).toBe('请输入');
  });

  it('disables input when disabled prop is true', () => {
    const w = mount(UiInput, { props: { disabled: true } });
    expect(w.find('input').attributes('disabled')).toBeDefined();
  });

  it('passes modelValue to input value', () => {
    const w = mount(UiInput, { props: { modelValue: 'test value' } });
    expect(w.find('input').element.value).toBe('test value');
  });

  it('emits update:modelValue on input', async () => {
    const w = mount(UiInput, { props: { modelValue: '' } });
    await w.find('input').setValue('new value');
    expect(w.emitted('update:modelValue')).toBeTruthy();
    expect(w.emitted('update:modelValue')[0]).toEqual(['new value']);
  });

  it('emits focus on focus', async () => {
    const w = mount(UiInput);
    await w.find('input').trigger('focus');
    expect(w.emitted('focus')).toHaveLength(1);
  });

  it('emits blur on blur', async () => {
    const w = mount(UiInput);
    await w.find('input').trigger('blur');
    expect(w.emitted('blur')).toHaveLength(1);
  });

  it('applies default rows for textarea', () => {
    const w = mount(UiInput, { props: { type: 'textarea' } });
    expect(w.find('textarea').attributes('rows')).toBe('4');
  });

  it('applies custom rows for textarea', () => {
    const w = mount(UiInput, { props: { type: 'textarea', rows: 8 } });
    expect(w.find('textarea').attributes('rows')).toBe('8');
  });

  it('handles number modelValue', () => {
    const w = mount(UiInput, { props: { modelValue: 42 } });
    expect(w.find('input').element.value).toBe('42');
  });
});
