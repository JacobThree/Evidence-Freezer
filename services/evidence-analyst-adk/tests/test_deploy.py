from __future__ import annotations

import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from deploy import (
    DeploymentConfig,
    build_resource_path,
    build_resource_url,
    build_runtime_env,
    config_from_env,
    deployment_plan,
    read_requirements,
    resource_url_from_name,
    validate_runtime_env,
)


def test_deploy_config_reads_required_agent_engine_environment() -> None:
    config = config_from_env(
        {
            "GOOGLE_CLOUD_PROJECT": "evidence-freezer-dev",
            "GOOGLE_CLOUD_REGION": "us-east4",
            "AGENT_ENGINE_STAGING_BUCKET": "gs://custom-staging",
            "PHOENIX_MCP_URL": "https://phoenix-mcp.example.run.app/mcp",
            "PHOENIX_MCP_AUTH_MODE": "google_id_token",
            "PHOENIX_MCP_AUDIENCE": "https://phoenix-mcp.example.run.app/mcp",
            "PHOENIX_MCP_SERVICE_ACCOUNT": "adk-analyst-sa@example.iam.gserviceaccount.com",
            "PHOENIX_MCP_TOOL_FILTER": "get-trace,get-spans",
        }
    )

    assert config.project == "evidence-freezer-dev"
    assert config.location == "us-east4"
    assert config.staging_bucket == "gs://custom-staging"
    assert config.service_account == "adk-analyst-sa@example.iam.gserviceaccount.com"


def test_runtime_env_contains_mcp_settings_without_reserved_agent_engine_names() -> None:
    env = build_runtime_env(
        DeploymentConfig(
            project="evidence-freezer-dev",
            location="us-east4",
            staging_bucket="gs://evidence-freezer-dev-agent-engine-staging",
            service_account="adk-analyst-sa@example.iam.gserviceaccount.com",
            phoenix_mcp_url="https://phoenix-mcp.example.run.app/mcp",
            phoenix_mcp_auth_mode="google_id_token",
            phoenix_mcp_audience="https://phoenix-mcp.example.run.app/mcp",
            phoenix_mcp_tool_filter="get-trace,get-spans",
        )
    )

    assert env == {
        "PHOENIX_MCP_AUTH_MODE": "google_id_token",
        "PHOENIX_MCP_SERVICE_ACCOUNT": "adk-analyst-sa@example.iam.gserviceaccount.com",
        "PHOENIX_MCP_URL": "https://phoenix-mcp.example.run.app/mcp",
        "PHOENIX_MCP_AUDIENCE": "https://phoenix-mcp.example.run.app/mcp",
        "PHOENIX_MCP_TOOL_FILTER": "get-trace,get-spans",
    }


def test_validate_runtime_env_rejects_reserved_agent_engine_names() -> None:
    try:
        validate_runtime_env({"GOOGLE_CLOUD_PROJECT": "bad"})
    except ValueError as error:
        assert "GOOGLE_CLOUD_PROJECT" in str(error)
    else:
        raise AssertionError("validate_runtime_env should reject reserved variables")


def test_requirements_include_agent_engine_and_adk_dependencies() -> None:
    requirements = read_requirements()

    assert "google-adk>=1.0.0" in requirements
    assert any(item.startswith("google-cloud-aiplatform[agent_engines,adk]") for item in requirements)
    assert "pydantic>=2.0.0" in requirements


def test_deployment_plan_redacts_bearer_token() -> None:
    plan = deployment_plan(
        DeploymentConfig(
            project="evidence-freezer-dev",
            location="us-east4",
            staging_bucket="gs://evidence-freezer-dev-agent-engine-staging",
            service_account="adk-analyst-sa@example.iam.gserviceaccount.com",
            phoenix_mcp_auth_mode="bearer",
            phoenix_mcp_bearer_token="secret-token",
        )
    )

    assert plan["env_vars"]["PHOENIX_MCP_BEARER_TOKEN"] == "REDACTED"
    assert plan["extra_packages"] == ["agent.py", "config.py", "prompts"]


def test_resource_path_helpers_match_agent_engine_format() -> None:
    assert (
        build_resource_path("project-1", "us-east4", "123")
        == "projects/project-1/locations/us-east4/reasoningEngines/123"
    )
    assert (
        build_resource_url("project-1", "us-east4", "123")
        == "https://us-east4-aiplatform.googleapis.com/v1/projects/project-1/locations/us-east4/reasoningEngines/123"
    )
    assert (
        resource_url_from_name("projects/project-1/locations/us-east4/reasoningEngines/123")
        == "https://us-east4-aiplatform.googleapis.com/v1/projects/project-1/locations/us-east4/reasoningEngines/123"
    )
