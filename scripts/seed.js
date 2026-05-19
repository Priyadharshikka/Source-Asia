'use strict';

/**
 * Seed the running server with N products, each having M image URLs and
 * a couple of video URLs. Useful for verifying the GET /products perf rule.
 *
 * Usage (server must already be running):
 *   node scripts/seed.js                 # defaults: 1000 products, 10 images
 *   PRODUCTS=2000 IMAGES=15 node scripts/seed.js
 *   BASE_URL=http://localhost:3000 node scripts/seed.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PRODUCTS = parseInt(process.env.PRODUCTS, 10) || 1000;
const IMAGES = parseInt(process.env.IMAGES, 10) || 10;
const VIDEOS = parseInt(process.env.VIDEOS, 10) || 1;
const CONCURRENCY = parseInt(process.env.CONCURRENCY, 10) || 32;

function buildPayload(i) {
  const sku = `SEED-${Date.now().toString(36)}-${i.toString().padStart(6, '0')}`;
  const image_urls = Array.from({ length: IMAGES }, (_, k) =>
    `https://cdn.example.com/products/${sku.toLowerCase()}/img-${k + 1}.jpg`);
  const video_urls = Array.from({ length: VIDEOS }, (_, k) =>
    `https://cdn.example.com/products/${sku.toLowerCase()}/demo-${k + 1}.mp4`);
  return {
    name: `Seeded Widget ${i + 1}`,
    sku,
    image_urls,
    video_urls,
  };
}

async function postProduct(i) {
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(i)),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`product ${i} failed: ${res.status} ${txt}`);
  }
}

async function run() {
  const started = Date.now();
  let next = 0;
  let done = 0;
  let lastLog = Date.now();

  async function worker() {
    while (next < PRODUCTS) {
      const i = next++;
      await postProduct(i);
      done++;
      if (Date.now() - lastLog > 1000) {
        // eslint-disable-next-line no-console
        console.log(`  ${done}/${PRODUCTS}`);
        lastLog = Date.now();
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Seeding ${PRODUCTS} products (images=${IMAGES}, videos=${VIDEOS}) → ${BASE_URL}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const ms = Date.now() - started;
  // eslint-disable-next-line no-console
  console.log(`Done. ${PRODUCTS} products in ${ms} ms (${(PRODUCTS / (ms / 1000)).toFixed(0)} req/s)`);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
