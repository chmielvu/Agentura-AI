
# 03: Reflexion & Self-Critique

"Reflexion" (or "Self-Correction") is an advanced agentic pattern used by this swarm to improve its own work. You see this most clearly with the "Complex" agent.

Instead of just giving you a final answer, the swarm performs a three-step process:
1.  **Generate v1:** An agent produces an initial "draft" of the answer.
2.  **Critique:** A "Critic" agent is autonomously invoked. It scores the v1 draft for quality, faithfulness, and coherence, and provides a harsh, actionable critique.
3.  **Generate v2:** The original agent receives its own v1 draft *plus* the critique, and is instructed to generate a "v2" final answer that incorporates the feedback.

This "v1 -> critique -> v2" loop is a SOTA technique that dramatically increases the quality and reliability of complex, subjective outputs. The "Retry" agent also uses this pattern to fix failed plans.
