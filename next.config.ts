import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // PptxGenJS uses Node imports only for filesystem/URL helpers. Browser exports
      // use in-memory image data, matching the package's own browser exclusions.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:(fs|https)$/,
          (resource: { request: string }) => {
            resource.request = resource.request.slice(5);
          },
        ),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
      };
    }
    return config;
  },
};
export default nextConfig;
