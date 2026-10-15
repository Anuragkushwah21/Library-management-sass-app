/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Dev only: let phones/tablets on the same Wi-Fi open `npm run dev` at
  // http://<computer-ip>:3000. Next 16 blocks other devices by default, which
  // leaves the page blank. Private network ranges only; no effect in production.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '172.17.*.*', '172.18.*.*', '172.19.*.*', '172.20.*.*'],
}

export default nextConfig
