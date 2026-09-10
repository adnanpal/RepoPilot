# RepoPilot

> AI-powered repository explorer that lets you understand and interact with your codebase through natural language.

RepoPilot is an AI codebase assistant that allows developers to upload a repository and ask questions about their code using natural language.

Instead of manually searching through files, navigating folders, and tracing API flows, you can simply ask RepoPilot questions such as:

- "Where is authentication implemented?"
- "How does the frontend communicate with the backend?"
- "Find the API endpoints in this repository."
- "Explain the architecture of this project."
- "What would break if I change the User model?"

RepoPilot uses an AI agent with tool calling to explore the uploaded repository and provide answers based on the actual code.

---

## ✨ Features

### 📦 Repository Upload

Upload a `.zip` repository and RepoPilot creates an isolated workspace for it.

### 💬 Natural Language Codebase Exploration

Ask questions about your repository without manually navigating through files.

### 🤖 AI Agent

The AI agent can decide when it needs to inspect the repository and use tools to gather the necessary context before answering.

### 🔎 Code Search

Search across the repository for functions, variables, routes, imports, components, API calls, and other relevant code.

### 📄 File Reading

Read relevant sections of source files instead of loading the entire repository into the model.

### 🌳 Project Structure

Inspect the repository structure to understand how different parts of the application are organized.

### 🛠️ Code Change Proposals

RepoPilot can analyze requested changes and prepare a proposed modification instead of immediately changing the code.

### 🔐 Repository Isolation

Uploaded repositories are identified using a unique repository ID so that agent operations can be scoped to the correct project.

---

## 🧠 How It Works

RepoPilot follows an agent + tools architecture.

```text
                         ┌─────────────────┐
                         │     User        │
                         │ "Explain auth"  │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  React Frontend │
                         └────────┬────────┘
                                  │
                                  │ HTTP
                                  ▼
                         ┌─────────────────┐
                         │ Express Backend │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   AI Agent      │
                         │   Qwen 3.6      │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
               Search Files   Read File    Project Tree
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Repository Code │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   AI Response   │
                         └─────────────────┘
