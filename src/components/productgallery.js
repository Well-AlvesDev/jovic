export default {
  name: 'ProductGallery',
  props: {
    images: { type: Array,  default: () => [] },
    loading: { type: Boolean, default: true },
    productName: { type: String, default: '' },
  },
  data() {
    return {
      activeIndex: 0,
      zoomed: false,
      zoomStyle: {},
    };
  },
  computed: {
    activeImage() {
      return this.images[this.activeIndex] || '';
    },
    hasMultiple() {
      return this.images.length > 1;
    },
  },
  methods: {
    selectImage(index) {
      this.activeIndex = index;
      this.zoomed = false;
    },
    prev() {
      this.activeIndex = (this.activeIndex - 1 + this.images.length) % this.images.length;
      this.zoomed = false;
    },
    next() {
      this.activeIndex = (this.activeIndex + 1) % this.images.length;
      this.zoomed = false;
    },
    toggleZoom() {
      this.zoomed = !this.zoomed;
    },
    onMouseMove(e) {
      if (!this.zoomed) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      this.zoomStyle = { transformOrigin: `${x}% ${y}%` };
    },
    onMouseLeave() {
      if (this.zoomed) {
        this.zoomed = false;
        this.zoomStyle = {};
      }
    },
  },
  template: `
    <div class="product-gallery">

      <!-- Skeleton -->
      <template v-if="loading">
        <div class="skeleton skeleton-gallery-main"></div>
        <div class="gallery-thumbs">
          <div v-for="n in 3" :key="n" class="skeleton skeleton-gallery-thumb"></div>
        </div>
      </template>

      <template v-else>
        <!-- Imagem principal -->
        <div
          class="gallery-main"
          :class="{ 'gallery-main--zoomed': zoomed }"
          @click="toggleZoom"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
          :title="zoomed ? 'Clique para sair do zoom' : 'Clique para ampliar'"
        >
          <img
            v-if="activeImage"
            :src="activeImage"
            :alt="productName"
            class="gallery-main-img"
            :style="zoomed ? zoomStyle : {}"
            draggable="false"
            @error="e => e.target.src = 'https://placehold.co/600x600?text=Imagem+Indisponível'"
          />
          <div v-else class="gallery-empty">
            <i class="ri-image-line"></i>
            <span>Sem imagem</span>
          </div>

          <!-- Zoom hint -->
          <div class="gallery-zoom-hint" v-if="!zoomed && activeImage">
            <i class="ri-zoom-in-line"></i>
          </div>

          <!-- Setas de navegação -->
          <template v-if="hasMultiple">
            <button class="gallery-nav gallery-nav--prev" @click.stop="prev" aria-label="Imagem anterior">
              <i class="ri-arrow-left-s-line"></i>
            </button>
            <button class="gallery-nav gallery-nav--next" @click.stop="next" aria-label="Próxima imagem">
              <i class="ri-arrow-right-s-line"></i>
            </button>
          </template>

          <!-- Contador -->
          <span v-if="hasMultiple" class="gallery-counter">
            {{ activeIndex + 1 }}/{{ images.length }}
          </span>
        </div>

        <!-- Thumbnails -->
        <div v-if="hasMultiple" class="gallery-thumbs">
          <button
            v-for="(img, i) in images"
            :key="i"
            :class="['gallery-thumb-btn', { 'gallery-thumb-btn--active': i === activeIndex }]"
            @click="selectImage(i)"
            :aria-label="'Ver imagem ' + (i + 1)"
          >
            <img
              :src="img"
              :alt="productName + ' ' + (i + 1)"
              class="gallery-thumb-img"
              @error="e => e.target.src = 'https://placehold.co/100x100?text=?'"
            />
          </button>
        </div>
      </template>

    </div>
  `,
};