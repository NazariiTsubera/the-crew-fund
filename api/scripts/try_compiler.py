"""Compile the demo prompts against real Gemini and print the recipes.

cd api && GEMINI_API_KEY=... uv run python -m scripts.try_compiler ["your own prompt"]
"""

import json
import sys

from crew.compiler import CompileError, compile_strategy
from crew.gemini import default_llm

PROMPTS = [
    "Buy stocks where options skew is rising and informed flow is building, "
    "but skip anything illiquid.",
    "Buy cheap quality companies trading below fair value and hold until the gap closes.",
    "Buy companies right after earnings surprise the model, and sit in cash when it stops working.",
]


def main() -> int:
    llm = default_llm()
    failures = 0
    for prompt in sys.argv[1:] or PROMPTS:
        print(f"\n> {prompt}")
        try:
            out = compile_strategy(prompt, llm)
            print(f"{out.name}: {out.strategy_line}")
            print(json.dumps(out.recipe.model_dump(), indent=2))
        except CompileError as e:
            failures += 1
            print(f"refused: {e}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
