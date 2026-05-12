import deploymentConfig from "@/deployment.json";

export const isBuiltDeployment = deploymentConfig.isBuiltDeployment;

function formatHostForUrl(hostname: string) {
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    return `[${hostname}]`;
  }

  return hostname;
}

function getLocalBrowserBackendHost() {
  const hostname = window.location.hostname;

  if (!hostname || hostname === "0.0.0.0" || hostname === "::") {
    return "localhost";
  }

  return hostname;
}

export function getConfiguredApiBaseUrl() {
  const explicitApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (explicitApiBaseUrl) {
    return explicitApiBaseUrl;
  }

  if (isBuiltDeployment) {
    return deploymentConfig.productionOrigin;
  }

  if (typeof window === "undefined") {
    return `http://localhost:${deploymentConfig.localBackendPort}`;
  }

  return `http://${formatHostForUrl(getLocalBrowserBackendHost())}:${
    deploymentConfig.localBackendPort
  }`;
}

export function getDeploymentLabel() {
  return isBuiltDeployment ? "built" : "test";
}
