export default {
  name: 'Breadcrumb',
  props: {
    items: {
      // [{ label: 'Início', href: './index.html' }, { label: 'Produto', href: null }]
      type: Array,
      default: () => [],
    },
  },
  template: `
    <nav class="breadcrumb" aria-label="Navegação estrutural">
      <ol class="breadcrumb-list">
        <li
          v-for="(item, index) in items"
          :key="index"
          class="breadcrumb-item"
          :aria-current="index === items.length - 1 ? 'page' : undefined"
        >
          <!-- Separador (exceto no primeiro) -->
          <i v-if="index > 0" class="ri-arrow-right-s-line breadcrumb-sep"></i>

          <!-- Link clicável -->
          <a
            v-if="item.href"
            :href="item.href"
            class="breadcrumb-link"
          >{{ item.label }}</a>

          <!-- Item atual (sem link) -->
          <span v-else class="breadcrumb-current">{{ item.label }}</span>
        </li>
      </ol>
    </nav>
  `,
};