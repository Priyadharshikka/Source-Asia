'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProductStore } = require('../src/modules/products/products.store');

test('create + list returns summaries without URL arrays', () => {
  const s = new ProductStore();
  s.create({
    name: 'A', sku: 'SKU-A',
    imageUrls: ['https://cdn.example.com/a/1.jpg', 'https://cdn.example.com/a/2.jpg'],
    videoUrls: [],
  });
  s.create({ name: 'B', sku: 'SKU-B', imageUrls: [], videoUrls: [] });

  const { items, total } = s.list({ limit: 10, offset: 0 });
  assert.equal(total, 2);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal('image_urls' in item, false);
    assert.equal('video_urls' in item, false);
    assert.ok('image_count' in item);
  }
  assert.equal(items[0].image_count, 2);
  assert.equal(items[0].thumbnail_url, 'https://cdn.example.com/a/1.jpg');
});

test('duplicate sku is rejected', () => {
  const s = new ProductStore();
  const r1 = s.create({ name: 'A', sku: 'X', imageUrls: [], videoUrls: [] });
  assert.equal(r1.conflict, false);
  assert.equal(s.hasSku('X'), true);
  const r2 = s.create({ name: 'A2', sku: 'X', imageUrls: [], videoUrls: [] });
  assert.equal(r2.conflict, true);
});

test('appendMedia updates counts and returns full record', () => {
  const s = new ProductStore();
  const r = s.create({ name: 'A', sku: 'X', imageUrls: [], videoUrls: [] });
  const id = r.summary.id;
  const updated = s.appendMedia(id, {
    imageUrls: ['https://cdn.example.com/x/1.jpg'],
    videoUrls: ['https://cdn.example.com/x/v.mp4'],
  });
  assert.equal(updated.image_count, 1);
  assert.equal(updated.video_count, 1);
  assert.equal(updated.image_urls.length, 1);
  assert.equal(updated.thumbnail_url, 'https://cdn.example.com/x/1.jpg');
});

test('pagination slices order array', () => {
  const s = new ProductStore();
  for (let i = 0; i < 25; i += 1) {
    s.create({ name: `P${i}`, sku: `S${i}`, imageUrls: [], videoUrls: [] });
  }
  const page = s.list({ limit: 10, offset: 10 });
  assert.equal(page.total, 25);
  assert.equal(page.items.length, 10);
  assert.equal(page.items[0].sku, 'S10');
  assert.equal(page.items[9].sku, 'S19');
});
