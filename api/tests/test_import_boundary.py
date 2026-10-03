"""The judged endpoints must never reach the compiler, chat or a Gemini client: the 100 judged
points cannot depend on an outside service.

The boundary is `app.routes.judged`, not `app.main`: the crew routes share the process and
legitimately import the compiler, but nothing the judged router imports may.
"""

import ast
from pathlib import Path

API = Path(__file__).parent.parent
FORBIDDEN = ("crew.compiler", "crew.chat", "crew.gemini", "google.genai", "google.generativeai")


def _module_file(root: Path, module: str) -> Path | None:
    base = root.joinpath(*module.split("."))
    for candidate in (base.with_suffix(".py"), base / "__init__.py"):
        if candidate.exists():
            return candidate
    return None


def _imports(path: Path, module: str) -> set[str]:
    package = module if path.name == "__init__.py" else module.rpartition(".")[0]
    found = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            found |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                parts = package.split(".")
                base = ".".join(parts[: len(parts) - node.level + 1])
                target = f"{base}.{node.module}" if node.module else base
            else:
                target = node.module
            found.add(target)
            # `from app.services import market` imports the submodule too.
            found |= {f"{target}.{alias.name}" for alias in node.names}
    return found


def reachable(root: Path, start: str) -> set[str]:
    """Every module name statically imported from `start`, following our own modules only."""
    seen, todo = set(), [start]
    while todo:
        module = todo.pop()
        if module in seen:
            continue
        seen.add(module)
        path = _module_file(root, module)
        if path is None:
            continue
        todo.extend(_imports(path, module))
    return seen


def forbidden_in(modules: set[str]) -> list[str]:
    return sorted(m for m in modules if any(m == f or m.startswith(f + ".") for f in FORBIDDEN))


def test_judged_routes_never_reach_gemini_the_compiler_or_chat():
    assert forbidden_in(reachable(API, "app.routes.judged")) == []


def test_the_walk_actually_follows_our_modules():
    modules = reachable(API, "app.routes.judged")

    assert {"app.services.backtest", "app.repository", "statevector"} <= modules


def test_a_forbidden_import_two_hops_away_is_caught(tmp_path):
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg/__init__.py").write_text("")
    (tmp_path / "pkg/routes.py").write_text("from . import helper\n")
    (tmp_path / "pkg/helper.py").write_text("from crew.compiler import compile_prompt\n")

    assert "crew.compiler" in forbidden_in(reachable(tmp_path, "pkg.routes"))
