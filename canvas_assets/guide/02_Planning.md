
# 02: The Power of Planning

The "Planner" agent is the swarm's "chain of thought." When you give the swarm a complex goal (e.g., "research a topic and then write code based on it"), the Planner is the first agent to act.

It decomposes your single goal into a series of smaller, logical steps. Each step is then assigned to a specialist agent (like "Research" or "Code"). You see this process happen in real-time in the chat.

This plan-based approach is a SOTA agentic pattern. It provides transparency (you see *how* the AI is thinking) and allows the swarm to execute complex, multi-domain tasks that would fail if attempted in a single step.

The plan steps can even pass information to each other. The "Research" agent can find data, which is then passed to the "DataAnalyst" agent to be visualized.
