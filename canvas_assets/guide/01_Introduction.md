
# 01: What is an Agentic Swarm?

This application, Agentura AI, is not a single AI model. It is a "Mixture-of-Experts" (MoE) agent swarm.

Think of it as a team of specialists. When you send a message, a "Router" agent analyzes your request and routes it to the specialist best suited for the job. You can see the full team in the "Agent Roster" tab.

This MoE pattern allows for more complex, high-quality results than a single, general-purpose AI can provide. For example, the `/code` agent is fine-tuned for Python, while the `/research` agent is built to find and verify web sources.

---

**Swarm Modes:**

*   **Informal Collaborators:** This is the default, flexible mode. A "Planner" agent creates a custom, multi-step plan using *any* of the agents you've enabled in the Roster.
*   **Security Service:** This is a fixed, high-reliability pipeline (Planner -> Research -> Code -> Critique). It is less flexible but designed for rigorous, verifiable tasks.
