from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import agent
from config import AnalystConfig, config_from_env, mcp_connection_settings


def test_config_reads_phoenix_mcp_environment() -> None:
    config = config_from_env(
        {
            "PHOENIX_MCP_URL": "https://phoenix-mcp-adapter.example.run.app/mcp",
            "PHOENIX_MCP_AUTH_MODE": "bearer",
            "PHOENIX_MCP_BEARER_TOKEN": "test-token",
            "PHOENIX_MCP_SERVICE_ACCOUNT": "adk-analyst-sa@example.iam.gserviceaccount.com",
            "PHOENIX_MCP_TOOL_FILTER": "get-trace,get-spans",
        }
    )

    settings = mcp_connection_settings(config)

    assert settings.url == "https://phoenix-mcp-adapter.example.run.app/mcp"
    assert settings.headers["Accept"] == "application/json, text/event-stream"
    assert settings.headers["Content-Type"] == "application/json"
    assert settings.headers["Authorization"] == "Bearer test-token"
    assert config.phoenix_mcp_service_account == "adk-analyst-sa@example.iam.gserviceaccount.com"
    assert settings.tool_filter == ("get-trace", "get-spans")


def test_bearer_auth_requires_token() -> None:
    config = AnalystConfig(
        phoenix_mcp_url="https://phoenix-mcp-adapter.example.run.app/mcp",
        phoenix_mcp_auth_mode="bearer",
    )

    with pytest.raises(ValueError, match="PHOENIX_MCP_BEARER_TOKEN"):
        mcp_connection_settings(config)


def test_build_root_agent_attaches_streamable_http_mcp_toolset() -> None:
    config = AnalystConfig(
        phoenix_mcp_url="https://phoenix-mcp-adapter.example.run.app/mcp",
        phoenix_mcp_auth_mode="bearer",
        phoenix_mcp_bearer_token="test-token",
        phoenix_mcp_tool_filter=("get-trace", "get-spans"),
    )

    root_agent = agent.build_root_agent(config)

    assert len(root_agent.tools) == 1
    toolset = root_agent.tools[0]
    assert toolset.tool_filter == ["get-trace", "get-spans"]
    assert toolset.connection_params.url == "https://phoenix-mcp-adapter.example.run.app/mcp"
    assert toolset.connection_params.headers["Authorization"] == "Bearer test-token"
    assert "Use Phoenix MCP read tools" in root_agent.description


def test_build_root_agent_without_mcp_url_keeps_tools_empty() -> None:
    root_agent = agent.build_root_agent(AnalystConfig())

    assert root_agent.tools == []
