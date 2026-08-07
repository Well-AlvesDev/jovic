export default {
  name: 'SearchAndTabs',
  props: {
    loading: { type: Boolean, default: true },
    categories: { type: Array, default: () => [] },
    modelValue: { type: String, default: '' },
    activeCategory: { type: String, default: 'TODAS' },
  },
  emits: ['update:modelValue', 'category-change', 'search'],
  data() {
    return {
      localSearch: this.modelValue,
    };
  },
  watch: {
    modelValue(newValue) {
      this.localSearch = newValue;
    },
  },
  methods: {
    onInput(e) {
      this.localSearch = e.target.value;
    },
    scrollToSearchBar() {
      const headerHeight = 70;
      const searchEl = this.$refs.searchWrap;
      if (!searchEl) return;
      const top = searchEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    },
    submitSearch() {
      this.$emit('update:modelValue', this.localSearch);
      this.$emit('search');
      this.scrollToSearchBar();
    },

    focusSearch() {
      this.scrollToSearchBar();
    },
    selectCategory(cat) {
      const normalizedCategory = String(cat || '').trim();
      const searchValue = normalizedCategory.toUpperCase() === 'TODAS' ? '' : normalizedCategory;

      this.localSearch = searchValue;
      this.$emit('update:modelValue', searchValue);
      this.$emit('category-change', cat);
      this.$emit('search');
      this.scrollToSearchBar();
    },
  },
  template: `
    <div class="search-tabs-wrap" ref="searchWrap">

      <!-- Search bar -->
      <div class="search-bar" @click="scrollToSearchBar">
        <i class="ri-search-line search-icon" role="button" @click="submitSearch" aria-label="Buscar"></i>
        <input
          type="search"
          inputmode="search"
          enterkeyhint="search"
          :value="localSearch"
          @input="onInput"
          @focus="scrollToSearchBar"
          @keydown.enter.prevent="submitSearch"
          placeholder="Digite sua busca..."
          class="search-input"
          aria-label="Buscar produtos"
        />
      </div>

      <!-- Category tabs -->
      <div class="tabs-scroll" role="tablist" aria-label="Categorias">
        <template v-if="loading">
          <div v-for="n in 5" :key="n" class="skeleton skeleton-tab"></div>
        </template>
        <template v-else>
          <button
            v-for="cat in ['TODAS', ...categories]"
            :key="cat"
            role="tab"
            :aria-selected="activeCategory === cat"
            :class="['tab-btn', { 'tab-btn--active': activeCategory === cat }]"
            @click="selectCategory(cat)"
          >
            {{ cat }}
          </button>
        </template>
      </div>

      <div class="tabs-underline"></div>
    </div>
  `,
};
