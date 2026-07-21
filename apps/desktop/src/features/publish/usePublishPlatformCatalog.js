import { computed } from 'vue'

const PLATFORM_BADGES = Object.freeze({
  bilibili: { tag: '新', tagClass: 'cohere-tag-success' },
})

export function usePublishPlatformCatalog (platformStore, accountStore) {
  const platforms = computed(() => platformStore.platforms.map(platform => ({
    id: platform.id,
    label: platform.label,
    ...(PLATFORM_BADGES[platform.id] || { tag: null, tagClass: '' }),
  })))

  const groupedPlatforms = computed(() => {
    const groups = { domestic: [], international: [] }
    for (const platform of platforms.value) {
      const item = {
        ...platform,
        accounts: accountStore.byPlatform?.[platform.id] || [],
      }
      const key = platformStore.getCategory(platform.id) === '海外' ? 'international' : 'domestic'
      groups[key].push(item)
    }

    return [
      groups.domestic.length > 0 ? { label: '国内平台', items: groups.domestic } : null,
      groups.international.length > 0 ? { label: '国际平台', items: groups.international } : null,
    ].filter(Boolean)
  })

  return { platforms, groupedPlatforms }
}
