# 数据所有权映射（Stage 2 域收敛，2026-09-02）

## 概述

本文档定义各模块对数据的读写权限，作为域收敛的参考基线。

## 模块数据所有权

| 模块 | 拥有数据 | 读写 | 共享方式 |
|------|---------|------|---------|
| **account-manager** | 账号凭证（cookies/localStorage） | RW | 加密存储，仅 credential-store 可读 |
| **credential-store** | 加密凭据（AES-256-GCM） | RW | 仅 account-manager 通过 API 访问 |
| **model-provider-manager** | 模型服务商配置 | RW | 通过 IPC 暴露给 renderer |
| **store（SQLite）** | 发布历史、草稿、定时任务 | RW | 通过 store.js IPC handler |
| **publish-monitor** | 发布后状态快照 | RW | 写入 store，读取通过 IPC |
| **batch-manager** | 批量任务队列 | RW | 通过 IPC 暴露 |
| **webview-manager** | WebContentsView 标签状态 | RW | 仅主进程内部 |
| **callback-server** | HTTP 回调记录 | W | 写入 store，读取通过 IPC |
| **ops-center-sync** | 运行时策略（公告/版本/敏感词） | R | 从 OpsCenter 拉取，本地缓存 |
| **story2video-engine** | 项目数据、运行状态 | RW | 通过 IPC 暴露 |
| **prompt-engine** | 提示词优化配置 | RW | 通过 prompt-bridge IPC |
| **splitter-bridge** | 分句结果缓存 | R | 内存缓存，不持久化 |
| **tts-voice-catalog** | 音色目录 | R | 从服务商拉取，本地缓存 |
| **license-manager** | 许可证状态 | RW | 通过 IPC 暴露 |
| **identity-manager** | 用户身份 | RW | 通过 IPC 暴露 |
| **pipeline-engine** | 流水线编排配置 | RW | 通过 IPC 暴露 |
| **auto-updater** | 更新状态 | R | 从 GitHub Releases 拉取 |

## 数据流方向

```
┌─────────────────────────────────────────────────────┐
│                    Renderer (Vue)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ accounts │ │ publish  │ │ story2video compose   │ │
│  └────┬─────┘ └────┬─────┘ └──────────┬───────────┘ │
│       │             │                 │              │
│  ════╪══ IPC ══════╪═════════════════╪══════════════│
│       │             │                 │              │
├───────┼─────────────┼─────────────────┼──────────────┤
│       │     Main Process (Electron)   │              │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────────┴───────────┐  │
│  │account   │ │publish   │ │story2video engine  │  │
│  │manager   │ │handler   │ │                    │  │
│  └────┬─────┘ └────┬─────┘ └────────┬───────────┘  │
│       │             │               │               │
│  ┌────┴─────┐ ┌────┴─────┐ ┌───────┴────────────┐  │
│  │credential│ │store     │ │run-state store     │  │
│  │store     │ │(SQLite)  │ │(JSONL files)       │  │
│  └──────────┘ └──────────┘ └────────────────────┘  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ops-center    │  │python bridges│                │
│  │sync (HTTP)   │  │(sidecar)     │                │
│  └──────────────┘  └──────────────┘                │
└─────────────────────────────────────────────────────┘
```

## 所有权原则

1. 每个数据实体有且仅有一个 RW 所有者
2. 其他模块通过 IPC 或 API 读取，不得直接访问文件
3. 加密敏感数据（凭据/密钥）仅通过 credential-store 访问
4. 缓存数据标记为 R（只读），源数据在远端
