// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'pfinance',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/diegopluna/pfinance' }],
      sidebar: [
        {
          label: 'Start here',
          items: [{ label: 'Fork & host quickstart', slug: 'guides/quickstart' }],
        },
        {
          label: 'Guides',
          items: [{ label: 'CI & PR previews (optional)', slug: 'guides/ci-pipeline' }],
        },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
})
