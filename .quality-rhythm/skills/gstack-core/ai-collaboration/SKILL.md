---
name: ai-collaboration
preamble-tier: 2
version: 1.0.0
description: |
  AI Collaboration Capability Guide. 2026+ programmers need a new skill:
  working effectively with AI coding tools. Four pillars: describing problems,
  providing context, reviewing output, consolidating experience into templates.
triggers:
  - AI collaboration tips
  - how to prompt AI
  - AI best practices
  - working with coding agents
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
  - Grep
  - Glob
---

# AI Collaboration Capability

AI coding is not about "automatically writing code" — it is about assisting the complete development process.

## Pillar 1: Describing Problems

### Common Mistakes

| Wrong Way | Problem | Better Way |
|-----------|---------|------------|
| "Write me a login" | Too vague, no context | "Implement email+password login in Next.js App Router with Prisma + PostgreSQL" |
| "This error is broken" | Missing error info | Paste full error + "happens during user registration" |
| "Optimize this function" | No optimization target | "This function is slow when data > 1000 items, target: 50%% faster" |

### Good Question Template

```
Goal: [what you want]
Context: [project/tech stack/existing code]
Boundaries: [what NOT to do]
Output Format: [how you want the answer structured]


## Pillar 2: Providing Context

When asking AI for help, provide context in order of priority:

```
P0 (required):
- Current file/module code or path
- Full error message (if debugging)
- Framework/library versions

P1 (strongly recommended):
- Project structure (entry files, key modules)
- Relevant config files
- Database schema (if data operations involved)

P2 (nice to have):
- Existing tests
- Related PRD or design docs
- Previously attempted solutions
```

### Context Template

```
## Tech Stack
- Framework: [Next.js 14 / FastAPI / Express...]
- Language: [TypeScript / Python...]
- Database: [PostgreSQL / SQLite...]
- Testing: [Jest / Pytest / Vitest...]

## Current Code
[relevant code link or snippet]

## Goal
[what you want AI to do]

## Constraints
[performance, security, coding style]

## Out of Scope
[what NOT to do]
```

---

## Pillar 3: Reviewing Output

### 6 Common AI Output Problems

1. **Code structure doesn't match project** — naming, directory, imports
2. **Missing exception handling** — try-catch? Error propagation?
3. **Missing auth checks** — new routes with auth? Existing guards bypassed?
4. **Transaction consistency** — multi-step writes rollback on failure?
5. **Happy-path only** — null values, edge cases, concurrency?
6. **Looks like demo code** — hardcoded values? Incomplete logging?

### Review Checklist

After each AI output:

```
[ ] Code style matches project?
[ ] Error handling complete?
[ ] Auth/security boundaries correct?
[ ] Edge cases covered?
[ ] No hardcoded secrets/credentials?
[ ] Tests pass?
[ ] No unnecessary new dependencies?
```

---

## Pillar 4: Consolidating Templates

## 文章第十二节的 8 项能力清单

文章说 AI 协作能力包括 8 项子能力。质量节拍 v2 为每项提供训练路径：

```
AI 协作能力                          训练路径（在质量节拍中）
────────────────────────────────────────────────────────────────
1. 会描述问题                        日常循环 Step ⓪ → /ai-collaboration Pillar 1
2. 会提供上下文                      日常循环 Step ① → 上下文完整性自检
3. 会拆任务                          Phase 1.3 → /autoplan Section 3.6
4. 会限制边界                        /office-hours Phase 2.8 → 需求边界探测
5. 会审查 AI 输出                    日常循环 Step ④ → /review + 6 大专项
6. 会让 AI 补测试                   日常循环 Step ② → TDD Phase 0
7. 会让 AI 整理文档                  日常循环 Step ⑤ → update-docs
8. 会把经验沉淀成模板                Phase 4.3 → /learn skillify
```

每次使用质量节拍，就是在训练这 8 项能力。


When you notice AI repeatedly makes the same mistake in a scenario, it is time to create a template:

```
Scenario: [what type of task]
Repeated Issue: [what AI gets wrong]
Solution: [correct approach]
Template Prompt: [reusable prompt for next time]
Example: [concrete example]
```

### Consolidation Flow

```
Notice recurring issue → Summarize as rule → Write as prompt template → Use next time
                                                       ↓
                                         Verified multiple times → Submit as skill
```

---

## Full Workflow

```
You have a task
    |
    v
1. Describe: Use Pillar 1 template
    |
    v
2. Context: Use Pillar 2 checklist
    |
    v
3. AI produces output
    |
    v
4. Review: Use Pillar 3 checklist
    |
    v
   Good? -> Done
    |
   Not good? -> Add context -> Back to 3
    |
   Repeated issue? -> Pillar 4: create template
```

---

## Important Rules

- **Do not assume AI knows your project structure.** The more you tell it upfront, the better its first try.
- **Do not say "fix this" without saying what "fixed" looks like.** The destination matters more than the starting point.
- **If AI produces wrong output twice in a row, STOP and add more context.** A third wrong guess means insufficient context, not bad AI.
- **Every recurring issue is a template opportunity.** Templates are the core asset of AI collaboration.
