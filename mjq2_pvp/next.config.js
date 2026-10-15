/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/', destination: '/home.html' },
      { source: '/index.html', destination: '/home.html' },
      { source: '/home', destination: '/home.html' },
      { source: '/doc', destination: '/doc.html' },
      { source: '/docs', destination: '/doc.html' },
      { source: '/deck', destination: '/deck_builder.html' },
      { source: '/play/:room', destination: '/ma_jia_qi_2.html' },
      { source: '/room/:room', destination: '/ma_jia_qi_2.html' },
      { source: '/host/:room', destination: '/ma_jia_qi_2.html' },
      { source: '/join/:room', destination: '/ma_jia_qi_2.html' },
      { source: '/watch/:room', destination: '/ma_jia_qi_2.html' }
    ];
  }
};

module.exports = nextConfig;
