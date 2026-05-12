import type { NextConfig } from "next";
import os from "node:os";

type NetworkInterfaceInfo = NonNullable<
  ReturnType<typeof os.networkInterfaces>[string]
>[number];

function isLocalIpv4Interface(
  networkInterface: NetworkInterfaceInfo | undefined
): networkInterface is NetworkInterfaceInfo {
  return Boolean(
    networkInterface &&
      networkInterface.family === "IPv4" &&
      !networkInterface.internal
  );
}

function getLocalIpv4Hosts() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(isLocalIpv4Interface)
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
