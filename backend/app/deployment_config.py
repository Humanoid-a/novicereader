from pathlib import Path
import json

from pydantic import BaseModel


class DeploymentConfig(BaseModel):
    isBuiltDeployment: bool = False
    productionDomain: str = "novicereader.com"
    productionOrigin: str = "https://novicereader.com"
    productionWwwOrigin: str = "https://www.novicereader.com"
    localFrontendOrigin: str = "http://localhost:3000"
    localBackendPort: int = 8000


ROOT_DIR = Path(__file__).resolve().parents[2]
DEPLOYMENT_CONFIG_PATH = ROOT_DIR / "deployment.json"


def read_deployment_config() -> DeploymentConfig:
    if not DEPLOYMENT_CONFIG_PATH.exists():
        return DeploymentConfig()

    return DeploymentConfig(
        **json.loads(DEPLOYMENT_CONFIG_PATH.read_text(encoding="utf-8"))
    )


deployment_config = read_deployment_config()
