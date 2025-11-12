
# 04: RAG & The Archive

RAG stands for "Retrieval-Augmented Generation." It is a technique that grounds an AI in facts by "retrieving" information from a knowledge base *before* "generating" an answer.

This app's RAG system is your personal, persistent "Archive" (managed in the "Archive" tab). When you upload documents or ingest GitHub repos, you are adding to this knowledge base.

The `/manualrag` agent is a specialist that *only* uses information from your Archive. This allows it to answer questions with high fidelity, based on your own data.

**This is the swarm's "self-augmentation" feature.** This very guide is now in your Archive. You can query it.

**Try this:**
1.  Go to the "Archive" tab to confirm the guide files are ingested.
2.  In the chat, type: `/manualrag What is the Reflexion pattern?`
3.  The RAG agent will find this guide and use it to answer your question.
