#!/usr/bin/env python3
"""
Time MCP Server
Provides time, timezone, and forex market hours awareness for AI agents.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("time-mcp")

FOREX_SESSIONS = {
    "Sydney":    {"open": 22, "close": 7,  "tz": "Australia/Sydney"},
    "Tokyo":     {"open": 0,  "close": 9,  "tz": "Asia/Tokyo"},
    "London":    {"open": 8,  "close": 17, "tz": "Europe/London"},
    "New York":  {"open": 13, "close": 22, "tz": "America/New_York"},
}

TIMEZONES = {
    "WIB":  "Asia/Jakarta",
    "WITA": "Asia/Makassar",
    "WIT":  "Asia/Jayapura",
    "UTC":  "UTC",
    "SGT":  "Asia/Singapore",
    "MYT":  "Asia/Kuala_Lumpur",
    "EST":  "America/New_York",
    "GMT":  "Europe/London",
    "JST":  "Asia/Tokyo",
    "AEST": "Australia/Sydney",
}


def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def forex_market_status() -> dict:
    now_utc = get_utc_now()
    utc_hour = now_utc.hour
    utc_minute = now_utc.minute
    utc_decimal = utc_hour + utc_minute / 60
    weekday = now_utc.weekday()

    sessions = {}
    active = []

    if weekday >= 5:
        return {"weekend": True, "sessions": {}, "active": [], "overlaps": []}

    for name, s in FOREX_SESSIONS.items():
        o, c = s["open"], s["close"]
        if o < c:
            is_open = o <= utc_decimal < c
        else:
            is_open = utc_decimal >= o or utc_decimal < c

        local_tz = ZoneInfo(s["tz"])
        local_time = now_utc.astimezone(local_tz).strftime("%H:%M %Z")
        sessions[name] = {"open": is_open, "local_time": local_time}
        if is_open:
            active.append(name)

    overlaps = []
    if "London" in active and "New York" in active:
        overlaps.append("London–New York (High volatility!)")
    if "Tokyo" in active and "London" in active:
        overlaps.append("Tokyo–London")
    if "Sydney" in active and "Tokyo" in active:
        overlaps.append("Sydney–Tokyo")

    return {"weekend": False, "sessions": sessions, "active": active, "overlaps": overlaps}


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_current_time",
            description=(
                "Get the current date and time in one or more timezones. "
                "Supports: WIB, WITA, WIT, UTC, SGT, MYT, EST, GMT, JST, AEST, "
                "or any IANA timezone string like 'America/New_York'."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "timezones": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of timezone codes or IANA strings",
                        "default": ["WIB", "UTC", "GMT", "EST"]
                    }
                }
            }
        ),
        Tool(
            name="forex_market_hours",
            description=(
                "Check which forex market sessions are currently open — "
                "Sydney, Tokyo, London, New York. "
                "Also shows overlap periods (high volatility), and whether it's weekend (market closed)."
            ),
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="convert_timezone",
            description="Convert a specific time from one timezone to another.",
            inputSchema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": (
                            "Time to convert. Accepts HH:MM (e.g. '14:30') "
                            "or full datetime (e.g. '2025-06-14 14:30')"
                        ),
                    },
                    "from_tz": {
                        "type": "string",
                        "description": "Source timezone code or IANA string e.g. WIB, UTC",
                    },
                    "to_tz": {
                        "type": "string",
                        "description": "Target timezone code or IANA string e.g. EST, GMT",
                    }
                },
                "required": ["time", "from_tz", "to_tz"]
            }
        ),
        Tool(
            name="time_until_market_open",
            description=(
                "Calculate how long until a specific forex session opens. "
                "Useful for knowing when London or New York opens from your local time."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "session": {
                        "type": "string",
                        "description": (
                            "Session name (case-insensitive): "
                            "sydney, tokyo, london, new york"
                        ),
                    }
                },
                "required": ["session"]
            }
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        if name == "get_current_time":
            tzs = arguments.get("timezones", ["WIB", "UTC", "GMT", "EST"])
            now_utc = get_utc_now()
            lines = ["🕐 Current Time\n"]
            for tz_code in tzs:
                iana = TIMEZONES.get(tz_code.upper(), tz_code)
                try:
                    local = now_utc.astimezone(ZoneInfo(iana))
                    lines.append(f"{tz_code:<8} {local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
                except Exception:
                    lines.append(f"{tz_code:<8} Invalid timezone")
            text = "\n".join(lines)

        elif name == "forex_market_hours":
            now_utc = get_utc_now()
            status = forex_market_status()
            lines = [f"🌍 Forex Market Status — {now_utc.strftime('%Y-%m-%d %H:%M UTC')}\n"]

            if status["weekend"]:
                lines.append("⛔ WEEKEND — All forex markets CLOSED")
                lines.append("Markets reopen: Monday 22:00 UTC (Sydney open)")
            else:
                lines.append(f"{'Session':<12} {'Status':<8} {'Local Time'}")
                lines.append("-" * 40)
                for sess, info in status["sessions"].items():
                    icon = "🟢" if info["open"] else "🔴"
                    status_str = "OPEN" if info["open"] else "CLOSED"
                    lines.append(f"{sess:<12} {icon} {status_str:<6}  {info['local_time']}")

                lines.append("")
                if status["active"]:
                    lines.append(f"Active sessions: {', '.join(status['active'])}")
                else:
                    lines.append("No sessions currently active")

                if status["overlaps"]:
                    lines.append(f"⚡ Overlaps (high volatility): {', '.join(status['overlaps'])}")

                if not status["active"]:
                    lines.append("\n⚠️  Low liquidity period — wider spreads likely on XAUUSD")

            text = "\n".join(lines)

        elif name == "convert_timezone":
            time_str = arguments["time"].strip()
            from_code = arguments["from_tz"]
            to_code = arguments["to_tz"]

            from_iana = TIMEZONES.get(from_code.upper(), from_code)
            to_iana = TIMEZONES.get(to_code.upper(), to_code)

            if len(time_str) > 5:
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M"):
                    try:
                        parsed = datetime.strptime(time_str, fmt)
                        hour, minute = parsed.hour, parsed.minute
                        ref_date = parsed.date()
                        break
                    except ValueError:
                        continue
                else:
                    hm_part = time_str.split(" ")[-1]
                    hour, minute = map(int, hm_part.split(":"))
                    ref_date = datetime.now(timezone.utc).date()
            else:
                hour, minute = map(int, time_str.split(":"))
                ref_date = datetime.now(timezone.utc).date()

            dt_from = datetime(ref_date.year, ref_date.month, ref_date.day, hour, minute,
                               tzinfo=ZoneInfo(from_iana))
            dt_to = dt_from.astimezone(ZoneInfo(to_iana))

            text = (
                f"🔄 Timezone Conversion\n\n"
                f"{time_str} {from_code}  →  {dt_to.strftime('%Y-%m-%d %H:%M')} {to_code}\n"
                f"({from_iana} → {to_iana})"
            )

        elif name == "time_until_market_open":
            raw_session = arguments["session"].strip()
            SESSION_ALIASES = {
                "sydney":   "Sydney",
                "tokyo":    "Tokyo",
                "london":   "London",
                "new york": "New York",
                "newyork":  "New York",
                "ny":       "New York",
                "new_york": "New York",
            }
            session = SESSION_ALIASES.get(raw_session.lower(), raw_session.title())
            if session not in FOREX_SESSIONS:
                valid = ", ".join(FOREX_SESSIONS.keys())
                text = f"❌ Unknown session '{raw_session}'. Valid options: {valid}"
                return [TextContent(type="text", text=text)]
            s = FOREX_SESSIONS[session]
            now_utc = get_utc_now()
            weekday = now_utc.weekday()

            open_hour = s["open"]
            now_decimal = now_utc.hour + now_utc.minute / 60

            if weekday >= 5:
                days_to_monday = (7 - weekday)
                text = (
                    f"⏰ {session} Market Open\n\n"
                    f"It's the weekend — markets are CLOSED.\n"
                    f"Next open: in ~{days_to_monday} day(s) (Monday {open_hour:02d}:00 UTC)"
                )
            else:
                if now_decimal < open_hour:
                    delta_hours = open_hour - now_decimal
                else:
                    delta_hours = 24 - now_decimal + open_hour

                hours = int(delta_hours)
                minutes = int((delta_hours - hours) * 60)

                local_tz = ZoneInfo(s["tz"])
                now_local = now_utc.astimezone(local_tz)

                status = forex_market_status()
                is_open = status["sessions"].get(session, {}).get("open", False)

                if is_open:
                    text = f"✅ {session} market is currently OPEN\nLocal time: {now_local.strftime('%H:%M %Z')}"
                else:
                    text = (
                        f"⏰ {session} Market opens in: {hours}h {minutes}m\n"
                        f"Opens at {open_hour:02d}:00 UTC\n"
                        f"Current local time: {now_local.strftime('%H:%M %Z')}"
                    )
        else:
            text = f"Unknown tool: {name}"

    except Exception as e:
        text = f"Error: {type(e).__name__}: {e}"

    return [TextContent(type="text", text=text)]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
