from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from pydantic import AnyUrl, Field, field_validator
from pydantic.dataclasses import dataclass as pydantic_dataclass

AuthMode = Literal["none", "bearer", "google_id_token"]


@pydantic_dataclass
class AnalystConfig:
    phoenix_mcp_url: AnyUrl | None = None
    phoenix_mcp_auth_mode: AuthMode = "none"
    phoenix_mcp_bearer_token: str | None = None
    phoenix_mcp_audience: str | None = None
    phoenix_mcp_service_account: str | None = None
    phoenix_mcp_tool_filter: tuple[str, ...] = Field(
        default=(
            "list-traces",
            "get-trace",
            "get-spans",
            "get-session",
            "get-prompt",
            "draft-prompt-patch",
        )
    )

    @field_validator("phoenix_mcp_tool_filter", mode="before")
    @classmethod
    def split_tool_filter(cls, value: object) -> tuple[str, ...] | object:
        if isinstance(value, str):
            return tuple(tool.strip() for tool in value.split(",") if tool.strip())
        return value

    @property
    def phoenix_mcp_enabled(self) -> bool:
        return self.phoenix_mcp_url is not None

    @property
    def phoenix_mcp_url_string(self) -> str:
        if self.phoenix_mcp_url is None:
            raise ValueError("PHOENIX_MCP_URL is required to build the Phoenix MCP toolset.")
        return str(self.phoenix_mcp_url).rstrip("/")


@dataclass(frozen=True)
class McpConnectionSettings:
    url: str
    headers: dict[str, str]
    tool_filter: tuple[str, ...]


def config_from_env(env: dict[str, str] | None = None) -> AnalystConfig:
    source = os.environ if env is None else env
    return AnalystConfig(
        phoenix_mcp_url=empty_to_none(source.get("PHOENIX_MCP_URL")),
        phoenix_mcp_auth_mode=(source.get("PHOENIX_MCP_AUTH_MODE") or "none").lower(),
        phoenix_mcp_bearer_token=empty_to_none(source.get("PHOENIX_MCP_BEARER_TOKEN")),
        phoenix_mcp_audience=empty_to_none(source.get("PHOENIX_MCP_AUDIENCE")),
        phoenix_mcp_service_account=empty_to_none(source.get("PHOENIX_MCP_SERVICE_ACCOUNT")),
        phoenix_mcp_tool_filter=source.get("PHOENIX_MCP_TOOL_FILTER")
        or "list-traces,get-trace,get-spans,get-session,get-prompt,draft-prompt-patch",
    )


def mcp_connection_settings(config: AnalystConfig) -> McpConnectionSettings:
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }

    if config.phoenix_mcp_auth_mode == "bearer":
        if not config.phoenix_mcp_bearer_token:
            raise ValueError("PHOENIX_MCP_BEARER_TOKEN is required when PHOENIX_MCP_AUTH_MODE=bearer.")
        headers["Authorization"] = f"Bearer {config.phoenix_mcp_bearer_token}"

    if config.phoenix_mcp_auth_mode == "google_id_token":
        audience = config.phoenix_mcp_audience or config.phoenix_mcp_url_string
        headers["Authorization"] = f"Bearer {fetch_google_id_token(audience)}"

    return McpConnectionSettings(
        url=config.phoenix_mcp_url_string,
        headers=headers,
        tool_filter=config.phoenix_mcp_tool_filter,
    )


def fetch_google_id_token(audience: str) -> str:
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "google-auth is required for PHOENIX_MCP_AUTH_MODE=google_id_token."
        ) from error

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, audience)


def empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
