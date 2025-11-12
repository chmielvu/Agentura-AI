
# 05: Advanced Reasoning Patterns

Agents can be designed to "think" in different ways. These patterns are templates for how an agent structures its reasoning.

**Chain of Thought (CoT):**
This is the simplest pattern. The agent is forced to "think step-by-step" in a single, linear line of reasoning.
*   **Template:** `[Question]... Let's think step-by-step.`
*   **Use Case:** Good for simple logic, math, or commonsense problems.

**Tree of Thoughts (ToT):**
This is a more advanced pattern where an agent explores multiple *branching* paths.
1.  **Generate:** The agent generates several possible "next steps" (thoughts).
2.  **Evaluate:** It critiques each thought (e.g., "promising," "dead end").
3.  **Search:** It explores the most promising branches and can "backtrack" if a path fails.
*   **Use Case:** Good for complex problems with many variables or potential dead ends, like planning or solving puzzles.

**Graph of Thoughts (GoT):**
This is the most powerful pattern and is what this swarm's `Planner` agent uses. It allows reasoning paths to not only *branch* (like ToT) but also to *merge* and form *cycles*.
1.  **Branch:** The agent can explore two ideas in parallel (e.g., Step A, Step B).
2.  **Merge:** The agent can then create a new step (Step C) that *depends on the outputs* of both Step A and Step B.
*   **Use Case:** High-stakes, complex tasks that require synthesizing many different types of information, like orchestrating a multi-agent swarm.
