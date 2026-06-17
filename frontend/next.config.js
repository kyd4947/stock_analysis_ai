/** @type {import('next').NextConfig} */
const nextConfig = {
  // Render/Vercel 환경에서 메모리 효율을 극대화하는 설정입니다.
  output: 'standalone',
  
  // 만약 이미지를 외부(예: Yahoo Finance 등)에서 가져온다면 아래 설정을 추가하세요.
  // images: {
  //   domains: ['example.com'],
  // },
};

module.exports = nextConfig;