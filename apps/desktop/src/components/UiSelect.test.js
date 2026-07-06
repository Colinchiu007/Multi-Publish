import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSelect from './UiSelect.vue';

describe('UiSelect', () => {
  const options = ['option1', 'option2', 'option3'];

  it('renders select element', () => {
    const w = mount(UiSelect, { props: { options } });
    expect(w.find('select').exists()).toBe(true);
  });

  it('renders options from array of strings', () => {
    const w = mount(UiSelect, { props: { options } });
    const opts = w.findAll('option');
    expect(opts).toHaveLength(3);
    expect(opts[0].text()).toBe('option1');
    expect(opts[1].text()).toBe('option2');
    expect(opts[2].text()).toBe('option3');
  });

  it('renders options from array of objects', () => {
    const objOpts = [
      { value: 'cn', label: '中文' },
      { value: 'en', label: 'English' },
    ];
    const w = mount(UiSelect, { props: { options: objOpts } });
    const opts = w.findAll('option');
    expect(opts).toHaveLength(2);
    expect(opts[0].text()).toBe('中文');
    expect(opts[0].attributes('value')).toBe('cn');
    expect(opts[1].text()).toBe('English');
    expect(opts[1].attributes('value')).toBe('en');
  });

  it('renders placeholder option', () => {
    const w = mount(UiSelect, { props: { options, placeholder: '请选择' } });
    const opts = w.findAll('option');
    expect(opts).toHaveLength(4);
    expect(opts[0].text()).toBe('请选择');
    expect(opts[0].attributes('value')).toBe('');
    expect(opts[0].attributes('disabled')).toBeDefined();
  });

  it('renders label when provided', () => {
    const w = mount(UiSelect, { props: { options, label: '语言' } });
    expect(w.find('.ui-select-label').text()).toBe('语言');
  });

  it('emits update:modelValue on change', async () => {
    const w = mount(UiSelect, { props: { options, modelValue: '' } });
    await w.find('select').setValue('option2');
    expect(w.emitted('update:modelValue')).toBeTruthy();
    expect(w.emitted('update:modelValue')[0]).toEqual(['option2']);
  });

  it('disables select when disabled prop is true', () => {
    const w = mount(UiSelect, { props: { options, disabled: true } });
    expect(w.find('select').attributes('disabled')).toBeDefined();
  });

  it('applies disabled state on individual options', () => {
    const objOpts = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
    ];
    const w = mount(UiSelect, { props: { options: objOpts } });
    const opts = w.findAll('option');
    expect(opts[1].attributes('disabled')).toBeDefined();
  });

  it('passes modelValue to select value', () => {
    const w = mount(UiSelect, { props: { options, modelValue: 'option2' } });
    expect(w.find('select').element.value).toBe('option2');
  });
});
