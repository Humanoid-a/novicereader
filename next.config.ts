import type { NextConfig } from "next";
import os from "node:os";

function getLocalIpv4Hosts() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((networkInterface) => {
      return (
        networkInterface &&
        networkInterface.family === "IPv4" &&
        !networkInterface.internal
      );
    })
    .map((networkInterface) => networkInterface.address);
}

function getAllowedDevOrigins() {
  const configuredOrigins =
    process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  return Array.from(
    new Set([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      ...getLocalIpv4Hosts(),
      ...configuredOrigins,
    ])
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
};

export default nextConfig;
