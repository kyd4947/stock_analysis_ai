/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발 환경에서 외부 IP(192.168.221.1)를 통한 접속 및 실시간 업데이트(HMR)를 허용합니다.
  experimental: {
    allowedDevOrigins: ['192.168.221.1'],
  },
};

export default nextConfig;