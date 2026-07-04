import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlatformIcon from './PlatformIcon.vue';
import UiSelect from './UiSelect.vue';

describe('PlatformIcon', () => {
  it('shows letter for douyin', () => {
    const w = mount(PlatformIcon, { props: { platform: 'douyin' } });
    expect(w.text()).toBe('抖');
  });
  it('shows B for bilibili', () => {
    const w = mount(PlatformIcon, { props: { platform: 'bilibili' } });
    expect(w.text()).toBe('B');
  });
  it('renders with label prop', () => {
    const w = mount(PlatformIcon, { props: { platform: 'weixin', label: 'WX' } });
    expect(w.text()).toBe('W');
  });
  it('shows first letter for unknown platform', () => {
    const w = mount(PlatformIcon, { props: { platform: 'unknown' } });
    expect(w.text()).toBe('U');
  });
});

describe('UiSelect', () => {
  it('renders two options', () => {
    const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    const w = mount(UiSelect, { props: { modelValue: 'a', options: opts } });
    expect(w.findAll('option').length).toBe(2);
  });
  it('emits update on change', async () => {
    const opts = [{ value: 'x', label: 'X' }];
    const w = mount(UiSelect, { props: { options: opts, modelValue: '' } });
    await w.find('select').setValue('x');
    expect(w.emitted('update:modelValue')).toBeTruthy();
  });
  it('shows placeholder', () => {
    const w = mount(UiSelect, { props: { options: [], placeholder: '选择' } });
    expect(w.find('option').text()).toBe('选择');
  });
});
