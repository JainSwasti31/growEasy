/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allows importing from the shared workspace package without building it first
  transpilePackages: ['@groweasy/shared'],
};

export default nextConfig;
