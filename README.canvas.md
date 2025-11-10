# Agentura AI - GAIS Canvas Workspace

Welcome to the in-studio exploration workspace for Agentura AI. This environment uses Canvas assets and Genkit flows to power the agentic swarm.

## Developer Quick Commands

Use the Command Palette (`/`) in the chat interface for runtime commands.

### In-Studio Setup & Evaluation

**1. Embed Corpus:**
   - This process is currently manual. Add text files to `canvas_assets/corpus/` and update the `workspace_assets/corpus_embeddings.json` placeholder with their vector representations using `text-embedding-004`.

**2. Run Retriever Demo:**
   - Use the chat interface and ask a question that requires information from the corpus.
   - Example: `/research Summarize the first document in the corpus.`

**3. Run Evaluator & Update Agent Memory:**
   - The evaluator flow reads `canvas_assets/logs/session_logs.json` to compute metrics.
   - It writes a reflection to `canvas_assets/memory/agent_memory_v1.txt`.
   - The agent automatically loads the latest reflection text on the next session.

**4. Reset Memory:**
   - To start a fresh session without reflective context, clear the contents of `canvas_assets/memory/agent_memory_v1.txt`.

## Core Artifacts

- **`canvas_assets/constitution.md`**: The agent's core rules, enforced at runtime.
- **`genkit/`**: Contains all backend logic, including the main orchestration flow, tools, and safety middleware.
- **`ui/`**: Contains all frontend React components and the new modular orchestrator hook.
