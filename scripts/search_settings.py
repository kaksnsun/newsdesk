"""Apply Newsdesk's engine catalog to its private SearXNG configuration."""
import json
import os
from copy import deepcopy
from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml


catalog = json.loads((Path(__file__).resolve().parent.parent / "search-engines.json").read_text())
DEFAULT, TOPIC, STANDBY = (catalog[key] for key in ("default", "topic", "standby"))


def configure_engines(path):
    path = Path(path)
    settings = yaml.safe_load(path.read_text(encoding="utf-8"))
    original = deepcopy(settings)
    defaults = settings.get("use_default_settings", True)
    if defaults is True:
        defaults = {}
    if not isinstance(defaults, dict):
        return  # A complete, independently managed SearXNG settings file.
    settings["use_default_settings"] = defaults
    engine_filter = defaults.setdefault("engines", {})
    pool = engine_filter.setdefault("keep_only", [])
    removed = set(engine_filter.get("remove", []))
    overrides = settings.setdefault("engines", [])
    by_name = {entry["name"]: entry for entry in overrides}
    for name in (*DEFAULT, *TOPIC, *STANDBY):
        if name in removed:
            continue
        if name not in pool:
            pool.append(name)
        if name not in by_name:
            by_name[name] = {"name": name}
            overrides.append(by_name[name])
        entry = by_name[name]
        entry.setdefault("disabled", name not in DEFAULT)
        if name in ("mojeek", "yahoo news"):
            entry.setdefault("inactive", False)
    if settings == original:
        return
    with NamedTemporaryFile("w", dir=path.parent, encoding="utf-8", delete=False) as temp:
        try:
            yaml.safe_dump(settings, temp, allow_unicode=True, sort_keys=False)
            temp.flush()
            os.replace(temp.name, path)
        finally:
            Path(temp.name).unlink(missing_ok=True)


if __name__ == "__main__":
    import sys
    configure_engines(sys.argv[1])
