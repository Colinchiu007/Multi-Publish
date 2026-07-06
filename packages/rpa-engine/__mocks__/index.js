/**
 * @multi-publish/rpa-engine auto-mock for cross-package jest tests
 */
const mockPlatformSelectors = {
  PLATFORM_PUBLISH_SELECTORS: {
    bilibili: {
      urlPatterns: { login: '', publish: '' },
      selectors: { loginBtn: '', publishBtn: '', titleInput: '', contentInput: '', submitBtn: '' },
    },
    zhihu: {
      urlPatterns: { login: '', publish: '' },
      selectors: { loginBtn: '', publishBtn: '', titleInput: '', contentInput: '', submitBtn: '' },
    },
  },
};

module.exports = {
  platformSelectors: mockPlatformSelectors,
  registry: { getPublisherClass: () => {}, listPlatforms: () => [] },
  browserData: {},
};
