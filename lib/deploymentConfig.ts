import deploymentConfig from "@/deployment.json";

export const isBuiltDeployment = deploymentConfig.isBuiltDeployment;

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

  return `http://${window.location.hostname}:${deploymentConfig.localBackendPort}`;
}

export function getDeploymentLabel() {
  return isBuiltDeployment ? "built" : "test";
}
