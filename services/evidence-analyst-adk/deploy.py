from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SERVICE_DIR = Path(__file__).resolve().parent
REQUIREMENTS_PATH = SERVICE_DIR / "requirements.txt"
FORBIDDEN_AGENT_ENGINE_ENV_PREFIX = "GOOGLE_CLOUD_AGENT_ENGINE"
FORBIDDEN_AGENT_ENGINE_ENV_VARS = {
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_LOCATION",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_QUOTA_PROJECT",
    "K_CONFIGURATION",
    "K_REVISION",
    "K_SERVICE",
    "PORT",
}
DEFAULT_DISPLAY_NAME = "Evidence Freezer Analyst"
DEFAULT_DESCRIPTION = (
    "Forensic ADK analyst for Evidence Freezer Phoenix traces. "
    "Returns strict Case File JSON for suspicious LLM behavior."
)


@dataclass(frozen=True)
class DeploymentConfig:
    project: str
    location: str
    staging_bucket: str
    service_account: str
    display_name: str = DEFAULT_DISPLAY_NAME
    description: str = DEFAULT_DESCRIPTION
    phoenix_mcp_url: str | None = None
    phoenix_mcp_auth_mode: str = "google_id_token"
    phoenix_mcp_bearer_token: str | None = None
    phoenix_mcp_audience: str | None = None
    phoenix_mcp_service_account: str | None = None
    phoenix_mcp_tool_filter: str | None = None


def config_from_env(env: dict[str, str] | None = None) -> DeploymentConfig:
    source = os.environ if env is None else env
    project = required(source, "GOOGLE_CLOUD_PROJECT")
    location = source.get("GOOGLE_CLOUD_REGION") or source.get("GOOGLE_CLOUD_LOCATION") or "us-east4"
    service_account = required(source, "PHOENIX_MCP_SERVICE_ACCOUNT")
    staging_bucket = source.get("AGENT_ENGINE_STAGING_BUCKET") or f"gs://{project}-agent-engine-staging"

    return DeploymentConfig(
        project=project,
        location=location,
        staging_bucket=staging_bucket,
        service_account=service_account,
        display_name=source.get("AGENT_ENGINE_DISPLAY_NAME") or DEFAULT_DISPLAY_NAME,
        description=source.get("AGENT_ENGINE_DESCRIPTION") or DEFAULT_DESCRIPTION,
        phoenix_mcp_url=empty_to_none(source.get("PHOENIX_MCP_URL")),
        phoenix_mcp_auth_mode=(source.get("PHOENIX_MCP_AUTH_MODE") or "google_id_token").lower(),
        phoenix_mcp_bearer_token=empty_to_none(source.get("PHOENIX_MCP_BEARER_TOKEN")),
        phoenix_mcp_audience=empty_to_none(source.get("PHOENIX_MCP_AUDIENCE")),
        phoenix_mcp_service_account=service_account,
        phoenix_mcp_tool_filter=empty_to_none(source.get("PHOENIX_MCP_TOOL_FILTER")),
    )


def build_runtime_env(config: DeploymentConfig) -> dict[str, str]:
    env = {
        "PHOENIX_MCP_AUTH_MODE": config.phoenix_mcp_auth_mode,
        "PHOENIX_MCP_SERVICE_ACCOUNT": config.phoenix_mcp_service_account or config.service_account,
    }
    optional_values = {
        "PHOENIX_MCP_URL": config.phoenix_mcp_url,
        "PHOENIX_MCP_BEARER_TOKEN": config.phoenix_mcp_bearer_token,
        "PHOENIX_MCP_AUDIENCE": config.phoenix_mcp_audience,
        "PHOENIX_MCP_TOOL_FILTER": config.phoenix_mcp_tool_filter,
    }
    env.update({key: value for key, value in optional_values.items() if value})
    validate_runtime_env(env)
    return env


def read_requirements(path: Path = REQUIREMENTS_PATH) -> list[str]:
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def build_resource_path(project: str, location: str, resource_id: str) -> str:
    return f"projects/{project}/locations/{location}/reasoningEngines/{resource_id}"


def build_resource_url(project: str, location: str, resource_id: str) -> str:
    return f"https://{location}-aiplatform.googleapis.com/v1/{build_resource_path(project, location, resource_id)}"


def deployment_plan(config: DeploymentConfig) -> dict[str, Any]:
    return {
        "display_name": config.display_name,
        "description": config.description,
        "project": config.project,
        "location": config.location,
        "staging_bucket": config.staging_bucket,
        "service_account": config.service_account,
        "requirements": read_requirements(),
        "env_vars": redact_env(build_runtime_env(config)),
        "extra_packages": ["agent.py", "config.py", "prompts"],
    }


def deploy(config: DeploymentConfig) -> Any:
    import vertexai
    from vertexai import agent_engines

    try:
        from .agent import build_root_agent
        from .config import AnalystConfig
    except ImportError:
        from agent import build_root_agent
        from config import AnalystConfig

    vertexai.init(project=config.project, location=config.location, staging_bucket=config.staging_bucket)

    root_agent = build_root_agent(
        AnalystConfig(
            phoenix_mcp_url=config.phoenix_mcp_url,
            phoenix_mcp_auth_mode=config.phoenix_mcp_auth_mode,
            phoenix_mcp_bearer_token=config.phoenix_mcp_bearer_token,
            phoenix_mcp_audience=config.phoenix_mcp_audience,
            phoenix_mcp_service_account=config.phoenix_mcp_service_account,
            phoenix_mcp_tool_filter=config.phoenix_mcp_tool_filter
            or "list-traces,get-trace,get-spans,get-session,get-prompt,draft-prompt-patch",
        )
    )
    agent_engine = root_agent
    if hasattr(agent_engines, "AdkApp"):
        agent_engine = agent_engines.AdkApp(agent=root_agent, enable_tracing=True)

    return agent_engines.create(
        agent_engine=agent_engine,
        requirements=read_requirements(),
        extra_packages=[
            str(SERVICE_DIR / "agent.py"),
            str(SERVICE_DIR / "config.py"),
            str(SERVICE_DIR / "prompts"),
        ],
        env_vars=build_runtime_env(config),
        display_name=config.display_name,
        description=config.description,
        service_account=config.service_account,
    )


def validate_runtime_env(env: dict[str, str]) -> None:
    forbidden = [
        key
        for key in env
        if key in FORBIDDEN_AGENT_ENGINE_ENV_VARS or key.startswith(FORBIDDEN_AGENT_ENGINE_ENV_PREFIX)
    ]
    if forbidden:
        names = ", ".join(sorted(forbidden))
        raise ValueError(f"Agent Engine runtime env contains reserved variable(s): {names}")


def redact_env(env: dict[str, str]) -> dict[str, str]:
    redacted = dict(env)
    if redacted.get("PHOENIX_MCP_BEARER_TOKEN"):
        redacted["PHOENIX_MCP_BEARER_TOKEN"] = "REDACTED"
    return redacted


def required(source: dict[str, str], name: str) -> str:
    value = empty_to_none(source.get(name))
    if value is None:
        raise ValueError(f"{name} is required")
    return value


def empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def resource_name_from_remote(remote: Any) -> str | None:
    for attr in ("resource_name", "name"):
        value = getattr(remote, attr, None)
        if value:
            return str(value)
    if isinstance(remote, dict):
        return str(remote.get("resource_name") or remote.get("name") or "") or None
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy the Evidence Freezer ADK analyst to Agent Engine.")
    parser.add_argument("--dry-run", action="store_true", help="Print the deployment plan without creating a resource.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = config_from_env()

    if args.dry_run:
        plan = deployment_plan(config)
        print(json.dumps(plan, indent=2, sort_keys=True) if args.json else format_plan(plan))
        return

    remote = deploy(config)
    resource_name = resource_name_from_remote(remote)
    result = {
        "resource_name": resource_name,
        "resource_url": resource_url_from_name(resource_name),
        "location": config.location,
        "service_account": config.service_account,
    }
    print(json.dumps(result, indent=2, sort_keys=True) if args.json else format_plan(result))


def resource_url_from_name(resource_name: str | None) -> str | None:
    if not resource_name:
        return None
    parts = resource_name.split("/")
    try:
        project = parts[parts.index("projects") + 1]
        location = parts[parts.index("locations") + 1]
        resource_id = parts[parts.index("reasoningEngines") + 1]
    except (ValueError, IndexError):
        return None
    return build_resource_url(project, location, resource_id)


def format_plan(plan: dict[str, Any]) -> str:
    return "\n".join(f"{key}: {value}" for key, value in plan.items())


if __name__ == "__main__":
    main()
