'use strict';

const { randomUUID } = require('crypto');

/**
 * Product catalog in-memory store.
 *
 * Storage split to satisfy the list-vs-detail performance rule:
 *
 *   summaries: Map<id, ProductSummary>   ← used by GET /products
 *     { id, name, sku, image_count, video_count, thumbnail_url, created_at }
 *
 *   media:     Map<id, ProductMedia>     ← used ONLY by GET /products/:id
 *                                          and POST /products/:id/media
 *     { image_urls: string[], video_urls: string[] }
 *
 *   skuIndex:  Map<sku, id>              ← O(1) duplicate-sku check
 *   order:     id[]                      ← preserves insertion order for pagination
 *
 * The list endpoint reads only `summaries` and never touches the (potentially
 * large) URL arrays in `media`. Map preserves insertion order in JS, but we
 * keep an explicit `order` array so pagination is an O(1) slice and so we
 * don't have to materialise a full iterator.
 *
 * Concurrency: all mutating methods are fully synchronous (no `await`), so
 * Node's single-threaded event loop gives us atomicity per call.
 */
class ProductStore {
  constructor() {
    this.summaries = new Map();
    this.media = new Map();
    this.skuIndex = new Map();
    this.order = [];
  }

  hasSku(sku) {
    return this.skuIndex.has(sku);
  }

  create({ name, sku, imageUrls, videoUrls }) {
    // Caller is responsible for checking hasSku() first if it wants a
    // separate 409. We re-check here to keep the invariant atomic.
    if (this.skuIndex.has(sku)) {
      return { conflict: true };
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const summary = {
      id,
      name,
      sku,
      image_count: imageUrls.length,
      video_count: videoUrls.length,
      thumbnail_url: imageUrls.length > 0 ? imageUrls[0] : null,
      created_at: createdAt,
    };
    const mediaRec = {
      image_urls: imageUrls.slice(),
      video_urls: videoUrls.slice(),
    };
    this.summaries.set(id, summary);
    this.media.set(id, mediaRec);
    this.skuIndex.set(sku, id);
    this.order.push(id);
    return { conflict: false, summary, media: mediaRec };
  }

  /**
   * Returns { items, total }. `items` are summaries only — never touches media.
   */
  list({ limit, offset }) {
    const total = this.order.length;
    if (offset >= total) {
      return { items: [], total };
    }
    const slice = this.order.slice(offset, offset + limit);
    const items = new Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) {
      items[i] = this.summaries.get(slice[i]);
    }
    return { items, total };
  }

  getById(id) {
    const summary = this.summaries.get(id);
    if (!summary) return null;
    const mediaRec = this.media.get(id);
    return {
      id: summary.id,
      name: summary.name,
      sku: summary.sku,
      image_urls: mediaRec.image_urls,
      video_urls: mediaRec.video_urls,
      image_count: summary.image_count,
      video_count: summary.video_count,
      thumbnail_url: summary.thumbnail_url,
      created_at: summary.created_at,
    };
  }

  appendMedia(id, { imageUrls, videoUrls }) {
    const summary = this.summaries.get(id);
    if (!summary) return null;
    const mediaRec = this.media.get(id);

    if (imageUrls.length > 0) {
      // Push individually to avoid creating a large intermediate array.
      for (let i = 0; i < imageUrls.length; i += 1) mediaRec.image_urls.push(imageUrls[i]);
      summary.image_count += imageUrls.length;
      if (!summary.thumbnail_url) summary.thumbnail_url = imageUrls[0];
    }
    if (videoUrls.length > 0) {
      for (let i = 0; i < videoUrls.length; i += 1) mediaRec.video_urls.push(videoUrls[i]);
      summary.video_count += videoUrls.length;
    }
    return this.getById(id);
  }

  size() {
    return this.order.length;
  }
}

const store = new ProductStore();

module.exports = { ProductStore, store };
