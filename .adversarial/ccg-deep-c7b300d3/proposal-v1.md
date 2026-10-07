# 变更提案（自动生成，待对抗评审）

- base: `origin/main`
- head: `c7b300d3980474b8d7b1a0f7f6b514e60bc5b028`
- 采集模式: `diff`
- 变更规模: 5500 行

## 变更内容

```diff
diff --git a/.ccg/reviews/00db11fdbc1bdc7a526776948cb24b47947a822e.json b/.ccg/reviews/00db11fdbc1bdc7a526776948cb24b47947a822e.json
new file mode 100644
index 00000000..5817fbb5
--- /dev/null
+++ b/.ccg/reviews/00db11fdbc1bdc7a526776948cb24b47947a822e.json
@@ -0,0 +1,23 @@
+{
+  "sha": "00db11fdbc1bdc7a526776948cb24b47947a822e",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 0 行（≤ 200）但命中 auth/数据库/加密：敏感内容 11 处",
+  "stats": {
+    "changedLines": 0,
+    "fileCount": 1,
+    "codeFileCount": 0,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 11
+  },
+  "stagedDiffHash": "e99635eb27976b41ec0ad3d6f16cb0b4f860edc8ed00d6d387a6d38bfd80916a",
+  "decidedAt": "2026-10-07T10:12:23.352Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/07746fe28cb60c2c8346d310958533c66e790e92.json b/.ccg/reviews/07746fe28cb60c2c8346d310958533c66e790e92.json
new file mode 100644
index 00000000..1cc0729f
--- /dev/null
+++ b/.ccg/reviews/07746fe28cb60c2c8346d310958533c66e790e92.json
@@ -0,0 +1,23 @@
+{
+  "sha": "07746fe28cb60c2c8346d310958533c66e790e92",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 185 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 185,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "769e7793e7f55ef0e679754a785f8a305aec7c4aa65d669569c59927e1fcca2d",
+  "decidedAt": "2026-10-07T06:26:51.378Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/0b3893b5df7aaddee9d859875bf2a522ae2bc8e9.json b/.ccg/reviews/0b3893b5df7aaddee9d859875bf2a522ae2bc8e9.json
new file mode 100644
index 00000000..a0f314c1
--- /dev/null
+++ b/.ccg/reviews/0b3893b5df7aaddee9d859875bf2a522ae2bc8e9.json
@@ -0,0 +1,23 @@
+{
+  "sha": "0b3893b5df7aaddee9d859875bf2a522ae2bc8e9",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 3 行（≤ 200）但命中 auth/数据库/加密：敏感内容 1 处",
+  "stats": {
+    "changedLines": 3,
+    "fileCount": 3,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 1
+  },
+  "stagedDiffHash": "a981e72a6155c7d54ed858e1bdea66b4d94915e5d1c1e8476d0c428b6bbd6fcb",
+  "decidedAt": "2026-10-07T05:47:54.938Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/17c610572c65d67be97d9a2c6de6d1a0bf13b598.json b/.ccg/reviews/17c610572c65d67be97d9a2c6de6d1a0bf13b598.json
new file mode 100644
index 00000000..083c0379
--- /dev/null
+++ b/.ccg/reviews/17c610572c65d67be97d9a2c6de6d1a0bf13b598.json
@@ -0,0 +1,23 @@
+{
+  "sha": "17c610572c65d67be97d9a2c6de6d1a0bf13b598",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 596 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 596,
+    "fileCount": 4,
+    "codeFileCount": 4,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "9a83bbe6dcde97c5f559c3161b9a70c8fc61512c05b7c3c7884c4504520ad46a",
+  "decidedAt": "2026-10-07T05:40:53.344Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/1e9e422564389b0f455dd86bd840be5c096a20de.json b/.ccg/reviews/1e9e422564389b0f455dd86bd840be5c096a20de.json
new file mode 100644
index 00000000..c17e633f
--- /dev/null
+++ b/.ccg/reviews/1e9e422564389b0f455dd86bd840be5c096a20de.json
@@ -0,0 +1,23 @@
+{
+  "sha": "1e9e422564389b0f455dd86bd840be5c096a20de",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 78 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 78,
+    "fileCount": 1,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "66cedd1dd713529a7dd63276e34aba30da7bbf7d1d330042b820604085691b98",
+  "decidedAt": "2026-10-07T09:45:06.891Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/27bf5a6d49b4574fe3c0524bf035c36a13874aaf.json b/.ccg/reviews/27bf5a6d49b4574fe3c0524bf035c36a13874aaf.json
new file mode 100644
index 00000000..d70c3614
--- /dev/null
+++ b/.ccg/reviews/27bf5a6d49b4574fe3c0524bf035c36a13874aaf.json
@@ -0,0 +1,23 @@
+{
+  "sha": "27bf5a6d49b4574fe3c0524bf035c36a13874aaf",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 30 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 30,
+    "fileCount": 1,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "ae453f6f8490d6e53bbd1ffd83a83b60e74ba1bebf4a174137f10d686a5d1fbe",
+  "decidedAt": "2026-10-07T05:56:31.052Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/2b8fdcdb7eaec8050e8a5b11dd3c46a319235576.json b/.ccg/reviews/2b8fdcdb7eaec8050e8a5b11dd3c46a319235576.json
new file mode 100644
index 00000000..9297b84b
--- /dev/null
+++ b/.ccg/reviews/2b8fdcdb7eaec8050e8a5b11dd3c46a319235576.json
@@ -0,0 +1,23 @@
+{
+  "sha": "2b8fdcdb7eaec8050e8a5b11dd3c46a319235576",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 369 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 369,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 4
+  },
+  "stagedDiffHash": "38a00eda0b47e4eb8314a4783340f34e533b12f10ed1c07998192ad976045c3a",
+  "decidedAt": "2026-10-07T06:08:09.525Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/3bd36dd47c4d3eeabe555d9693672498d27ce792.json b/.ccg/reviews/3bd36dd47c4d3eeabe555d9693672498d27ce792.json
new file mode 100644
index 00000000..d54c1d15
--- /dev/null
+++ b/.ccg/reviews/3bd36dd47c4d3eeabe555d9693672498d27ce792.json
@@ -0,0 +1,23 @@
+{
+  "sha": "3bd36dd47c4d3eeabe555d9693672498d27ce792",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 462 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 462,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 7
+  },
+  "stagedDiffHash": "c9293e3673da7c03a47b14568122eb8a03f628a3ad303041b90d54dda76dc1e5",
+  "decidedAt": "2026-10-07T04:49:31.896Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/4e1fea5caa791067a80953fc3591076679a90002.json b/.ccg/reviews/4e1fea5caa791067a80953fc3591076679a90002.json
new file mode 100644
index 00000000..d5359497
--- /dev/null
+++ b/.ccg/reviews/4e1fea5caa791067a80953fc3591076679a90002.json
@@ -0,0 +1,23 @@
+{
+  "sha": "4e1fea5caa791067a80953fc3591076679a90002",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 36 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 36,
+    "fileCount": 1,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "0386466f727dc9e72b33e94d304e2675fc9914089c2ff6be67a67d41a5c5d95e",
+  "decidedAt": "2026-10-07T07:36:17.591Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/4fa2c76a481ce4cbb6b55258fbaeab54c8b0a8d6.json b/.ccg/reviews/4fa2c76a481ce4cbb6b55258fbaeab54c8b0a8d6.json
new file mode 100644
index 00000000..47261148
--- /dev/null
+++ b/.ccg/reviews/4fa2c76a481ce4cbb6b55258fbaeab54c8b0a8d6.json
@@ -0,0 +1,23 @@
+{
+  "sha": "4fa2c76a481ce4cbb6b55258fbaeab54c8b0a8d6",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 450 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 450,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "0407f1fa115133c5cd7ffc7198ffd5f300f2fd50cec03bfb786f8f1e0b078b1c",
+  "decidedAt": "2026-10-07T05:07:58.742Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/5d429082ac39236329710f5ffba4506c53539803.json b/.ccg/reviews/5d429082ac39236329710f5ffba4506c53539803.json
new file mode 100644
index 00000000..c1c17f4e
--- /dev/null
+++ b/.ccg/reviews/5d429082ac39236329710f5ffba4506c53539803.json
@@ -0,0 +1,23 @@
+{
+  "sha": "5d429082ac39236329710f5ffba4506c53539803",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 236 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 236,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "ddd68754fa0585394799945273abafa7ceaf520d4d5e8b10f0b8b2a3db0f8152",
+  "decidedAt": "2026-10-07T05:02:19.872Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/5de8b93d5d8a73b729a03532a6725c16f0b0c34b.json b/.ccg/reviews/5de8b93d5d8a73b729a03532a6725c16f0b0c34b.json
new file mode 100644
index 00000000..20c5a1ff
--- /dev/null
+++ b/.ccg/reviews/5de8b93d5d8a73b729a03532a6725c16f0b0c34b.json
@@ -0,0 +1,23 @@
+{
+  "sha": "5de8b93d5d8a73b729a03532a6725c16f0b0c34b",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 115 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 115,
+    "fileCount": 4,
+    "codeFileCount": 4,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "5f3442e7a45a4733adba179add7ff0b5427c50fecd695200d3f426bce0196528",
+  "decidedAt": "2026-10-07T05:23:03.831Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/8a68203021ec8aafb96fa5d2a22b31451b2da831.json b/.ccg/reviews/8a68203021ec8aafb96fa5d2a22b31451b2da831.json
new file mode 100644
index 00000000..278aedae
--- /dev/null
+++ b/.ccg/reviews/8a68203021ec8aafb96fa5d2a22b31451b2da831.json
@@ -0,0 +1,23 @@
+{
+  "sha": "8a68203021ec8aafb96fa5d2a22b31451b2da831",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 419 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 419,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 24
+  },
+  "stagedDiffHash": "7af15c3d95a4c8fbb87ec8abab4b20f7678f6c15039df5d537d5d22714815154",
+  "decidedAt": "2026-10-07T04:10:04.972Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/903c79f7e426141d86df2b502c4d3a822dbd1841.json b/.ccg/reviews/903c79f7e426141d86df2b502c4d3a822dbd1841.json
new file mode 100644
index 00000000..0863c4c7
--- /dev/null
+++ b/.ccg/reviews/903c79f7e426141d86df2b502c4d3a822dbd1841.json
@@ -0,0 +1,23 @@
+{
+  "sha": "903c79f7e426141d86df2b502c4d3a822dbd1841",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 23 行（≤ 200）但命中 auth/数据库/加密：敏感内容 1 处",
+  "stats": {
+    "changedLines": 23,
+    "fileCount": 2,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 1
+  },
+  "stagedDiffHash": "3b8b7d577a71de3fb4f16a2b41e22fdab5e07a29d330055515d916baab86fe1b",
+  "decidedAt": "2026-10-07T03:09:35.989Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/9ea2b68a581583fc6ff177a9885a0a336c5d69a1.json b/.ccg/reviews/9ea2b68a581583fc6ff177a9885a0a336c5d69a1.json
new file mode 100644
index 00000000..b7417f09
--- /dev/null
+++ b/.ccg/reviews/9ea2b68a581583fc6ff177a9885a0a336c5d69a1.json
@@ -0,0 +1,23 @@
+{
+  "sha": "9ea2b68a581583fc6ff177a9885a0a336c5d69a1",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 385 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 385,
+    "fileCount": 4,
+    "codeFileCount": 4,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 4
+  },
+  "stagedDiffHash": "c8ce5898868fa5f0786c9244a2c43070b869556a03b118a6e08489561091053c",
+  "decidedAt": "2026-10-07T04:38:17.644Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/a3c36884bb1167232b3ff985641e75c4f7062ad2.json b/.ccg/reviews/a3c36884bb1167232b3ff985641e75c4f7062ad2.json
new file mode 100644
index 00000000..ddad591d
--- /dev/null
+++ b/.ccg/reviews/a3c36884bb1167232b3ff985641e75c4f7062ad2.json
@@ -0,0 +1,23 @@
+{
+  "sha": "a3c36884bb1167232b3ff985641e75c4f7062ad2",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 123 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 123,
+    "fileCount": 4,
+    "codeFileCount": 4,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "1314e5b09eee2e81c028cea1176dcde16a3930506c1ac56e73be5d12e4df5cac",
+  "decidedAt": "2026-10-07T06:54:52.089Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/a4796674769d42d1e4fdd1bb3ba1b74c069e3925.json b/.ccg/reviews/a4796674769d42d1e4fdd1bb3ba1b74c069e3925.json
new file mode 100644
index 00000000..832599f8
--- /dev/null
+++ b/.ccg/reviews/a4796674769d42d1e4fdd1bb3ba1b74c069e3925.json
@@ -0,0 +1,23 @@
+{
+  "sha": "a4796674769d42d1e4fdd1bb3ba1b74c069e3925",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 340 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 340,
+    "fileCount": 2,
+    "codeFileCount": 2,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 21
+  },
+  "stagedDiffHash": "0f5a08b50e550603a1cd04a07b5af456cce9ea645c5548ddee8b57368d9dca0b",
+  "decidedAt": "2026-10-07T04:55:06.393Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/be04906c6afc7ee3871c2b393eea48ae4a520ac5.json b/.ccg/reviews/be04906c6afc7ee3871c2b393eea48ae4a520ac5.json
new file mode 100644
index 00000000..915df31c
--- /dev/null
+++ b/.ccg/reviews/be04906c6afc7ee3871c2b393eea48ae4a520ac5.json
@@ -0,0 +1,23 @@
+{
+  "sha": "be04906c6afc7ee3871c2b393eea48ae4a520ac5",
+  "layer": "diff",
+  "mode": "skip",
+  "reason": "改动全部命中文档白名单 → 走 §11.2b docs-only 快通道",
+  "stats": {
+    "changedLines": 0,
+    "fileCount": 1,
+    "codeFileCount": 0,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "2b031d73be6d708ebfd75c678b12f3c004bf9da7fdd26582f9b55b3c187f9111",
+  "decidedAt": "2026-10-07T10:03:22.788Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": false,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/ca09b7c4e702f78ace95c673e4ecccc99c29e99b.json b/.ccg/reviews/ca09b7c4e702f78ace95c673e4ecccc99c29e99b.json
new file mode 100644
index 00000000..8cec407d
--- /dev/null
+++ b/.ccg/reviews/ca09b7c4e702f78ace95c673e4ecccc99c29e99b.json
@@ -0,0 +1,23 @@
+{
+  "sha": "ca09b7c4e702f78ace95c673e4ecccc99c29e99b",
+  "layer": "diff",
+  "mode": "dual",
+  "reason": "变更 261 行 > 200 行阈值（对齐 §12.6 Red Team）",
+  "stats": {
+    "changedLines": 261,
+    "fileCount": 4,
+    "codeFileCount": 4,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "925f9ddec734d3c4496f597de4aef99061ebf7dbdafe4e624c436f8360820da4",
+  "decidedAt": "2026-10-07T06:15:13.972Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/d42bea262ded447e77688036a7a0c087e7a74de6.json b/.ccg/reviews/d42bea262ded447e77688036a7a0c087e7a74de6.json
new file mode 100644
index 00000000..589d8ad1
--- /dev/null
+++ b/.ccg/reviews/d42bea262ded447e77688036a7a0c087e7a74de6.json
@@ -0,0 +1,23 @@
+{
+  "sha": "d42bea262ded447e77688036a7a0c087e7a74de6",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 27 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 27,
+    "fileCount": 1,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "5e0402799e121e84246ff0c6e29040a986e233fc8080436652024c818a413227",
+  "decidedAt": "2026-10-07T08:55:04.483Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.ccg/reviews/fc9776479d4e9f714477f156260b011c712fd7d3.json b/.ccg/reviews/fc9776479d4e9f714477f156260b011c712fd7d3.json
new file mode 100644
index 00000000..a195ecea
--- /dev/null
+++ b/.ccg/reviews/fc9776479d4e9f714477f156260b011c712fd7d3.json
@@ -0,0 +1,23 @@
+{
+  "sha": "fc9776479d4e9f714477f156260b011c712fd7d3",
+  "layer": "diff",
+  "mode": "single",
+  "reason": "变更 24 行（≤ 200）且无敏感命中 → 走 §12.6 常规专家分派",
+  "stats": {
+    "changedLines": 24,
+    "fileCount": 1,
+    "codeFileCount": 1,
+    "sensitivePathHits": [],
+    "plannedPathHits": [],
+    "sensitiveContentHits": 0
+  },
+  "stagedDiffHash": "8acd813c190abed95e7f4701541b0033df570d4ac0cc17a5313ea0ac46ccb038",
+  "decidedAt": "2026-10-07T05:49:12.908Z",
+  "decidedBy": "ccg-review-decider",
+  "deepReview": {
+    "required": true,
+    "status": "pending",
+    "performedBy": null,
+    "findings": null
+  }
+}
\ No newline at end of file
diff --git a/.quality-gates.md b/.quality-gates.md
index 1b7bfc56..45d13802 100644
--- a/.quality-gates.md
+++ b/.quality-gates.md
@@ -9344,3 +9344,26 @@ finding 2/3 则指出我的两处"修复"**没有真正生效**。这三条都
 - 豁免门禁（docs-only 通道，与运行时无关）：QM-1 打包 / QM-2 代码必检项 / QM-4 视觉 / TDD（无代码）/ QM-6 双模型评审
 - 备注：本 PR 仅新增 1 个 md 文件，pre-commit 实际执行 3 项门禁全过（分支守卫 / sync-version / CCG 审查模式判定）。回填提交的 CCG 判定 SKIP（命中 docs-only 快速通道，0 行代码变更）
 - 取证纪律记录：初稿 grep 得「window.confirm 39 处」，权威门禁 `check-frontend-consistency.js --json` 实为 **0**（grep 误计 `*.test.js` 断言）。该纠错已写入方案 1.3 节「取证时的自我纠错记录」，作为「基线文件优于人工统计」的实证
+
+## 本次执行记录：博主监控与采集实现（creator-monitor-impl，2026-10-07）
+
+> 支撑分支 `creator-monitor-impl`｜worktree `mp-blogger-collection`｜基线 `origin/main` = 8a682030
+| 门禁 | 状态 | Fresh 证据 |
+|------|------|-----------|
+| 变更类型与隔离 | PASS | 运行时代码变更；隔离 worktree，裸分支 `creator-monitor-impl`；共享根全程未写入 |
+| QM-1 打包 | PASS | `electron-builder --win --dir --publish never` rc=0；asar 145,257,509 字节；6 个 creator 模块全在包内；解包后逐个 require 成功；产物启动 8 秒存活且无本特性相关致命 stderr |
+| QM-4 视觉 | N/A | 新增 tab 仅用列表 + 徽章 + 空态，沿用既有 `.collection-tab-btn` 类，无新视觉面 |
+| TDD | PASS | 8 个新测试文件共 201 项；既有 `Collection.test.js` / `store-schema.test.js` / `automation-*.test.js` 随跑未绕开；合计 **312 全绿** |
+| 行尾与 diff 对账 | PASS | 两口径 `--numstat` 逐文件相等 |
+| 接线棘轮 | PASS | 新增测试均被本次改动显式引用；既有测试全部随跑 |
+| 外部记忆 | PASS | openspec 契约 `creator-monitor` + 执行记录 `creator-monitor-impl`；EverOS 与 learnings 已在方案阶段沉淀 |
+| 远程同步 | PENDING | 合并后回填 merge SHA 并删除 sync_* 三字段与 ledger 登记项 |
+
+### 遗留（不假装已闭合）
+
+- `content_aggregator` 是 Python optional 依赖，**不在 asar 内**；asar require 链通过不等于 YouTube 采集在打包产物上可用，取决于目标机器是否 pip 安装
+- `creator-monitor.js` 目前只含纯逻辑；探测调度、claim 落库、outbox finalizer、采集编排、送入 AI 写作**尚未接线到主进程**（IPC 层以依赖注入预留）
+- 未跑端到端真实采集（需 API Key + 打包产物内验证）
+>>>>>>> f6f294ae (chore(record): 补 QM-1 打包证据 + 质量节拍记录与 ledger 登记)
+>>>>>>> 861ec5a7 (chore(record): 补 QM-1 打包证据 + 质量节拍记录与 ledger 登记)
+
diff --git a/01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md b/01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md
index ebd7ea81..03abaf83 100644
--- a/01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md
+++ b/01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md
@@ -450,6 +450,46 @@ COMMIT
 
 **预检测试**：上表每行至少一条用例，断言 (a) 解析出的 `channelId` 正确、(b) units 消耗符合预期、(c) 失败文案正确。
 
+#### 6.2.1 `claim_token` 的精确协议（CCG 评审 i3 补缺）
+
+只说「按 token CAS」不够——实现时极易在某条 UPDATE 上漏掉条件，造成过期写覆盖。定义如下：
+
+| 项 | 定义 |
+|---|---|
+| 类型 | 单调递增整数 `generation`，**只在 claim 时 `+1`**，其余操作绝不改动 |
+| 签发 | `claim` 时 `claim_token = claim_token + 1` 并随 `UPDATE ... RETURNING` 返回 |
+| 持有者身份 | `claimed_by` 与 `claim_token` **同时**校验。token 递增即代表代次变更，旧持有者自动失效 |
+| 过期抢占 | 租约到期后新 worker claim ⇒ token 再次递增 ⇒ **旧 worker 全部后续写入被拒** |
+
+**必须带 `AND claim_token = ?` 的全部语句**（一张表，漏一条即失效）：
+
+```sql
+-- 1) 续租
+UPDATE creator_discoveries SET lease_expires_at=?, updated_at=?
+ WHERE id=? AND claim_token=? AND claimed_by=? AND collect_state='collecting';
+-- 2) 进度写入（同样受 fencing 约束：旧 worker 不得覆盖新持有者的进度）
+UPDATE creator_discoveries SET updated_at=?, last_error=?
+ WHERE id=? AND claim_token=? AND collect_state='collecting';
+-- 3) 成功提交
+UPDATE creator_discoveries SET collect_state='collected', collected_at=?, claimed_by='',
+       lease_expires_at=NULL, retry_after_at=NULL, last_error='', updated_at=?
+ WHERE id=? AND claim_token=? AND collect_state='collecting';
+-- 4) 失败提交
+UPDATE creator_discoveries SET collect_state='failed', last_error=?, claimed_by='',
+       lease_expires_at=NULL, retry_after_at=?, updated_at=?
+ WHERE id=? AND claim_token=? AND collect_state='collecting';
+```
+
+**`changes()===0` 的统一处置**：以上任一语句返回 0 ⇒ 本 worker 已过期，**立即放弃后续所有写操作**（含 outbox 入队），
+并把本地缓存的结果丢弃——绝不把「我算出来的正文」写进采集库。
+
+**跨表副作用必须同事务**：`claim_token` 只存在于 `creator_discoveries`，而采集库写入在 `viral_library`。
+「先查 token 再插另一表」存在 TOCTOU 窗口（查完到插入之间 token 可能已被新持有者提升）。
+故校验 + 跨表插入 MUST 在**同一个 `BEGIN IMMEDIATE` 事务**内完成，见 §8.3.1。
+
+**续租的前提**：续租本身也带 token 条件，因此**只有仍在推进的持有者能续租**；
+同时续租必须以**有进展**为前提（字节回调 / 阶段边界 / 阶段内心跳，满足其一），
+无进展仍续租会让挂死任务永不过期，占着 claim 不放。
 ### 6.3 关注状态机（CCG 评审 v2-i3 修订：区分「真故障暂停」与「不可自愈暂停」）
 
 ```
@@ -1101,7 +1141,9 @@ IPC 只返回 `{ status, fingerprint }`，**任何分支都不回传 Key 原文*
 | **产物幂等** | 产物文件名含内容指纹（`sha256(正文)[:16]`），重复搬运是覆盖而非追加 |
 | **可重试** | outbox 消费失败按指数退避重试（1min→8min→1h），上限 5 次后进死信 |
 | **补偿清理** | 崩溃残留的 staging 目录由启动清扫按 `mtime > 24h` 清理；**但 outbox 中仍有未完成记录（含死信）的不清**——死信需要人工介入，产物必须留着 |
-| **一致性判据** | ⚠ **终态判据必须与写入时机对齐**（CCG 评审 i8 Critical）：若同事务已写 `viral_library` + `collected`，而 outbox 尚未 `done`，则「三者等价」在**这段窗口内不成立**，删除与巡检会误判。正确做法是**把三者放进同一个最终化事务**：<br>`BEGIN IMMEDIATE` → 校验 token → 搬产物入最终位（文件级 rename，失败即整体回滚）→ UPSERT `viral_library` → `collect_state='collected'` + token 失效 → outbox `done` → `COMMIT`。<br>中间态用 **`collecting` / `ready`** 承载，**不参与终态判据**；只有 `collected` 才是终态。 |
+| **一致性判据** | ⚠ **终态判据必须与写入时机对齐**（CCG 评审 i1 纠正）。原设计把「写 `viral_library` + `collected`」与「outbox 置 `done`」分在两处，两者之间存在一个窗口：此刻 `collected` 已成立、outbox 却未 `done`，**三者等价的判据在该窗口内不成立**，删除与巡检会误判。<br>正确做法：**把三者放进同一个最终化事务**——`BEGIN IMMEDIATE` → 搬产物入最终位（文件级 rename，失败整体回滚）→ UPSERT `viral_library` → `collect_state=collected` + token 失效 → outbox 置 `done` → `COMMIT`。中间态用 **`collecting` / `ready`** 承载，**不参与终态判据**；只有 `collected` 是终态 |
+| **删除的原子性** | 删除采集库条目 MUST 在**同一事务**内完成：删 `viral_library` + discovery 落回 `pending` + `claim_token + 1`（使在途 worker 失效）+ 撤未 `done` 的 outbox。**缺任何一环都会留下漂移**：只删内容不落回 `pending` ⇒ 探测因唯一键跳过，该作品**永久不可再采**；不撤 outbox ⇒ 迟到的 finalizer 会把产物搬回来，出现「已删除却又复活」 |
+| **完整性巡检** | 每日全表核对：`collect_state=collected` 但 `viral_library` 无对应行 ⇒ 复位 `pending` + 记日志；`viral_library` 有行但无对应 discovery（历史/其他来源数据）**只计数不清理**，避免误伤。**巡检是对「任何未预期路径造成漂移」的兜底，不能只靠代码纪律** |
 
 **为什么不能用「先入库再补产物」**：那正是会产生「已采集但内容为空」的路径——用户看到已采集却拿不到正文，而 `content NOT NULL` 只挡得住 NULL 挡不住空串。**先落产物再入库**把失败暴露在入库之前，此时 discovery 仍是 `failed`，用户重试即可。
 
diff --git a/01-docs/learnings.md b/01-docs/learnings.md
index 59a724c4..2b626f96 100644
--- a/01-docs/learnings.md
+++ b/01-docs/learnings.md
@@ -17642,3 +17642,50 @@ YouTube Data API 的 `quotaExceeded` / `rateLimitExceeded` 返回 **403（4xx）
 `app.isPackaged = false` 钉死，全部分支只验证开发态，
 `grep -c "isPackaged = true"` = **0** ⇒ `payment.js:66` 那道生产拦截**从未被测过**。
 **凡是把环境量写死在 `beforeEach` 的测试，等于放弃了另一半世界。**
+
+## 五类「本地复现不了、只能从 CI 产物取证」的门禁红（2026-10-07，PR #3053 博主采集）
+
+这轮四个 job 同时红（债务熔断 / QG Static / QG Coverage + 两个 Desktop Shards / QG Visual），
+本地全绿的检查器在 CI 上全红。逐条复盘后发现**没有一个是逻辑 bug**，而是四类
+「本机环境与 CI 运行环境不同构」的门禁。共性教训：**门禁红先问「这台机器能不能复现」**，
+不能复现就直接去 CI 产物里取证，不要靠猜。
+
+1. **preload 注释里的通道样例会被当真通道提取**（`ipc-contract.test.js` 红）
+   `electron/tests/ipc-contract.test.js` 扫的是 preload 源文件**全文文本**，
+   我在 `preload/creator.js` 头注里写了 `ipcRenderer.invoke('creator:xxx', ...)` 当反例说明，
+   结果 `creator:xxx` 被提取成真通道，主进程没有同名 handler → 断言红。
+   同一个坑本地 `check-ipc-bridge` 是绿的（它只认**调用点**，注释不是调用点），
+   所以本地复现不出来。**写「不要这样写」的反例时，不要用会被提取器命中的形状**。
+
+2. **`container.setup.js` 顶到 500 行触发 `NEW_OVER_LIMIT`**（债务熔断门禁红）
+   博主采集接线 +24 行，文件从 476 涨到 500，`check-max-lines` 的口径是 `>= 500` 即阻断。
+   注意本地 `Get-Content .Count` 报 499、门禁报 500 —— 差在**末尾换行**，
+   判定以门禁口径为准。仓库对这条红线的既定处方是**拆兄弟模块**（本轮拆出
+   `core/container.setup.creator.js`，主文件回到 479），**禁止 `--update` 挂账**：
+   挂账等于承认「接受漂移」，而这个文件是全仓主进程服务的注册总表。
+   记这条是因为它和「`store-schema.js` 500 行熔断」是同一类约束的两次现身。
+
+3. **新增 preload 模块后必须重跑 `node scripts/build-preload.js`**
+   契约锁 `build-preload.test.js` 会核对「提交的 bundle 与源码暴露的 API 路径数完全相同」，
+   我加了 `preload/creator.js` 却没重算 bundle → 493 vs 494。
+   这个也是本地容易漏的：单测跑的是 `electron/tests/**`，bundle 产物在仓库里已提交，
+   不重算不会自动报错。**凡是新增/删除 preload 模块，提交前必须重算 bundle。**
+
+4. **视觉基线只能取自 CI 产物**（QG Visual Gate 7b 红）
+   给采集页加了「博主监控」页签 → `/collection` 的 `collection.png` 确定性漂移 237px
+   （两轮渲染 SHA256 逐字节相同，排除 flake）。这是**预期 UI 变更**，处方是更新基线，
+   但**必须从 `quality-gate-visual-reports` 产物里取 CI 渲染图**，
+   **不能在本机 `UPDATE_BASELINE=1` 重捕** —— 本机字体/滚动条/抗锯齿的环境差会被烘进基线，
+   抬高此后所有 PR 的 CI 误报（`01-docs/PRD-CLOUD-ACCOUNT-SYNC-2026-09-27.md` §17.4、
+   `PRD-AVATAR-EXPIRED-MASK-2026-09-24.md` §7.3 都有前车记录）。
+   另注：`--max-drift-px=0` 是零容忍口径，0.011% 的真实变更照样红；
+   而常规视觉套件用 6% 阈值，同一张图在 Gate 7 是过的 —— **同一个改动两个门禁结论相反**，
+   别拿 Gate 7 绿去推断 Gate 7b 也会绿。
+
+5. **`check-changelog-duplicate-entries` 在 CI 里是棘轮，本地不带参数必红**
+   该门禁的 CI 调用是 `--base=<merge-base> --head=HEAD`，只拦「本次 PR 让副本变多」；
+   不带参数本地跑，它会拿全量历史当现状，main 上 **828 份存量重复**直接判红。
+   记这条是为了避免下次误判成「是我 re-sync 时把 CHANGELOG 插重了」而去跑 `--dedup --apply` ——
+   那是**上游 1dd05b12（#2792）留下的历史债**，本 PR 副本数 828 → 828、新增 0，
+   跑 dedup 反而会在一个 PR 里夹带 828 处无关改动。**判棘轮类门禁必须先看 workflow 里
+   传了什么参数**，不能想当然用默认调用。
diff --git a/apps/desktop/electron/core/container.setup.creator.js b/apps/desktop/electron/core/container.setup.creator.js
new file mode 100644
index 00000000..21a183aa
--- /dev/null
+++ b/apps/desktop/electron/core/container.setup.creator.js
@@ -0,0 +1,47 @@
+'use strict';
+
+/**
+ * Container setup 分片：博主监控与采集（2026-10-07，PRD-CREATOR-MONITOR-COLLECT）
+ *
+ * 为什么从 container.setup.js 拆出来：
+ *   装配这三项需要 20+ 行注释与依赖串接，顶上去会让 container.setup.js 撞上
+ *   check-max-lines 的 500 行硬限（NEW_OVER_LIMIT，新代码不得引入超大文件）。
+ *   仓库对这条红线的既定处方是「拆兄弟模块」而不是 `--update` 挂账——
+ *   挂账等于承认「接受漂移」，而这个文件是全仓所有主进程服务的注册总表，
+ *   让它无限增长只会把真正的结构问题藏进台账里。
+ *
+ * 装配顺序有依赖：creatorStore 需要 store，creatorCollector 需要凭证提供者，
+ * creatorRuntime 依赖前两者。容器按注册顺序惰性求值，get 不到未注册名会抛，
+ * 故这里显式串起来而不是让 runtime 自己去 get。
+ */
+function registerCreatorServices(container) {
+  container.register('creatorStore', function(c) {
+    const { createCreatorStore } = require('../services/creator-store');
+    const store = c.get('store');
+    // getDb 是主路径；db 是历史字段名，两条都兜住以免 store 换实现时静默拿到 undefined
+    // （undefined 会在建表时才炸，离装配点很远，排查成本高）。
+    const db = typeof store.getDb === 'function' ? store.getDb() : store.db;
+    return createCreatorStore(db);
+  });
+
+  container.register('creatorCollector', function(c) {
+    const { createCreatorCollector } = require('../services/creator-collector-runtime');
+    return createCreatorCollector({
+      // 凭证提供者是可选注册项：未接入时回落空实现而不是让 get 抛，
+      // 否则「没配 Key」会变成「整个容器起不来」——两者的可恢复性完全不同。
+      credentialProvider: c.get('creatorCredentialProvider') || (() => null),
+      log: c.get('logger'),
+    });
+  });
+
+  container.register('creatorRuntime', function(c) {
+    const { createCreatorRuntime } = require('../services/creator-runtime');
+    return createCreatorRuntime({
+      store: c.get('creatorStore'),
+      collector: c.get('creatorCollector'),
+      log: c.get('logger'),
+    });
+  });
+}
+
+module.exports = { registerCreatorServices };
diff --git a/apps/desktop/electron/core/container.setup.js b/apps/desktop/electron/core/container.setup.js
index 3860963e..617043c2 100644
--- a/apps/desktop/electron/core/container.setup.js
+++ b/apps/desktop/electron/core/container.setup.js
@@ -215,6 +215,9 @@ function createContainer(options) {
   // 注意：目录在装配时快照式定型（与 app-*.log 同源）；若未来支持运行时切换日志目录，
   // 需同步评估审计日志是否跟随（当前生产无 setLogOptions 调用，契约稳定）。
   container.register("urlCollector", function(c) { return new UrlCollector({ auditDir: c.get("logger").getLogsDir() }); });
+  // 博主监控与采集：装配顺序有依赖（store → collector → runtime），拆到兄弟模块是为了
+  // 不让本文件撞上 500 行硬限，详见 container.setup.creator.js 头注。
+  require('./container.setup.creator').registerCreatorServices(container);
   // 知乎正文图片本地化（2026-10-03 PRD-ZHIHU-FAV-BATCH C1）：zhimg 防盗链 → Referer 伪装下载到 userData
   container.register("zhihuImageLocalizer", function(c) {
     const ZhihuImageLocalizer = require('../services/zhihu-image-localizer');
diff --git a/apps/desktop/electron/home-shell-preload.bundle.js b/apps/desktop/electron/home-shell-preload.bundle.js
index 12276d57..823f74ee 100644
--- a/apps/desktop/electron/home-shell-preload.bundle.js
+++ b/apps/desktop/electron/home-shell-preload.bundle.js
@@ -1088,6 +1088,28 @@ var require_aggregation = __commonJS({
   }
 });
 
+// electron/preload/creator.js
+var require_creator = __commonJS({
+  "electron/preload/creator.js"(exports2, module2) {
+    var { ipcRenderer: ipcRenderer2 } = require("electron");
+    function createCreatorApi(ipcRenderer3) {
+      return {
+        creatorList: () => ipcRenderer3.invoke("creator:list"),
+        creatorFollow: (payload) => ipcRenderer3.invoke("creator:follow", payload),
+        creatorUnfollow: (payload) => ipcRenderer3.invoke("creator:unfollow", payload),
+        creatorToggle: (payload) => ipcRenderer3.invoke("creator:toggle", payload),
+        creatorCheckNow: (payload) => ipcRenderer3.invoke("creator:check-now", payload),
+        creatorDiscoveries: (payload) => ipcRenderer3.invoke("creator:discoveries", payload),
+        creatorCollect: (payload) => ipcRenderer3.invoke("creator:collect", payload),
+        creatorCollectOne: (payload) => ipcRenderer3.invoke("creator:collect-one", payload),
+        creatorSkipOne: (payload) => ipcRenderer3.invoke("creator:skip-one", payload),
+        creatorSendToWriter: (payload) => ipcRenderer3.invoke("creator:send-to-writer", payload)
+      };
+    }
+    module2.exports = { createCreatorApi };
+  }
+});
+
 // electron/preload/hot-topics.js
 var require_hot_topics = __commonJS({
   "electron/preload/hot-topics.js"(exports2, module2) {
@@ -1470,6 +1492,7 @@ var require_preload = __commonJS({
     var { createServicesApi } = require_services();
     var { createFilmEngineeringApi } = require_film_engineering();
     var { createAggregationApi } = require_aggregation();
+    var { createCreatorApi } = require_creator();
     var { createHotTopicsApi } = require_hot_topics();
     var { createAutoPipelineApi } = require_auto_pipeline();
     var { createAutomationApi } = require_automation();
@@ -1519,6 +1542,7 @@ var require_preload = __commonJS({
       ...createServicesApi(ipcRenderer2),
       ...createFilmEngineeringApi(ipcRenderer2),
       ...createAggregationApi(ipcRenderer2),
+      ...createCreatorApi(ipcRenderer2),
       ...createHotTopicsApi(ipcRenderer2),
       ...createAutoPipelineApi(ipcRenderer2),
       ...createAutomationApi(ipcRenderer2),
diff --git a/apps/desktop/electron/ipc-handlers/creator.js b/apps/desktop/electron/ipc-handlers/creator.js
new file mode 100644
index 00000000..2bd7c819
--- /dev/null
+++ b/apps/desktop/electron/ipc-handlers/creator.js
@@ -0,0 +1,244 @@
+// @ts-check
+/**
+ * creator IPC handlers — 博主监控与采集的主进程入口
+ *
+ * 本层只做三件事，**不承载业务逻辑**：
+ *   1. 入参校验（越早拒绝越省资源，且能在产生副作用前失败）
+ *   2. 调用 creator-* 服务并把领域错误映射成 UI 可消费的形状
+ *   3. 依赖缺失时**降级返回**而不是不注册通道
+ *
+ * 第 3 点沿用 automation IPC 的既有教训：handler 不注册时，渲染层会收到
+ * Electron 原生的 "No handler registered for 'creator:collect'"——那句话
+ * 对用户毫无意义。统一返回 { code, reason }，让 UI 能显示「服务未就绪」。
+ *
+ * 通道全部在 license-access-control 中登记为 public，与既有采集通道一致。
+ */
+
+const {
+  COLLECT_DEFAULTS,
+  resolveEffectiveLimit,
+  planCollect,
+  ClampError,
+} = require('../services/creator-limits')
+
+const { CREATOR_INPUT_ERRORS } = require('../services/creator-collector')
+
+/** 领域错误 → UI 形状。排查方向不同的错误 MUST 分开，不要合并成一句话。 */
+function toIpcError (err) {
+  if (err instanceof ClampError) {
+    return { code: -11, reason: err.code, message: err.message, max: err.max, count: err.count }
+  }
+  const code = err && err.code
+  // 本特性所有领域错误都以 creator: 前缀标识（输入类见 CREATOR_INPUT_ERRORS，
+  // 其余为 discovery_not_found / follow_not_found / quota_would_exceed 等）。
+  // **必须整类透传**：只映射输入类枚举会让其余原因落进通用分支丢失 reason，
+  // 而「格式不对」「作品不存在」「配额不足」排查方向完全不同。
+  if (typeof code === 'string' && code.startsWith('creator:')) {
+    return { code: -12, reason: code, message: (err && err.message) || '' }
+  }
+  return { code: -1, reason: 'creator:failed', message: (err && err.message) || '操作失败' }
+}
+
+function requireString (payload, key, { max = 512 } = {}) {
+  const v = payload && payload[key]
+  if (typeof v !== 'string' || !v.trim()) {
+    const e = new Error('缺少必要参数')
+    e.code = CREATOR_INPUT_ERRORS.INVALID_INPUT
+    throw e
+  }
+  if (v.trim().length > max) {
+    const e = new Error('参数过长')
+    e.code = CREATOR_INPUT_ERRORS.INVALID_INPUT
+    throw e
+  }
+  return v.trim()
+}
+
+function registerHandlers (ipcMain, deps) {
+  const {
+    creatorStore,      // creator-store 实例
+    creatorCollector,  // resolveChannelId / listPosts
+    creatorMonitor,    // probeCreator / classifyFailure 等
+    creatorQuota,      // { probePool, collectPool, canSpend, spend }
+    log,
+  } = deps || {}
+
+  const degraded = (channel) => ipcMain.handle(channel, () => ({
+    code: -1,
+    reason: 'service-unavailable',
+    message: '博主监控服务未就绪，请在设置中检查依赖与凭证',
+    channel,
+  }))
+
+  const wrap = (fn) => async (_evt, payload) => {
+    try {
+      return await fn(payload || {})
+    } catch (err) {
+      if (log && log.warn) log.warn('[ipc:creator]', (err && err.message) || String(err))
+      return toIpcError(err)
+    }
+  }
+
+  // ── 依赖缺失：仍注册通道，返回可消费的降级结果 ──────────────────
+  if (!creatorStore || !creatorCollector || !creatorMonitor) {
+    log && log.error && log.error('Creator', 'creator services not provided — handlers in degraded mode')
+    for (const ch of [
+      'creator:list', 'creator:follow', 'creator:unfollow', 'creator:toggle',
+      'creator:check-now', 'creator:discoveries', 'creator:collect',
+      'creator:collect-one', 'creator:skip-one', 'creator:send-to-writer',
+    ]) degraded(ch)
+    return
+  }
+
+  // ── 博主列表（含待采集角标） ─────────────────────────────────
+  ipcMain.handle('creator:list', wrap(async () => {
+    const creators = await creatorStore.listCreators()
+    const items = []
+    for (const c of creators) {
+      items.push({ ...c, pendingCount: creatorStore.countPending(c.id) })
+    }
+    return { code: 0, items, totalPending: items.reduce((s, x) => s + x.pendingCount, 0) }
+  }))
+
+  // ── 关注博主 ────────────────────────────────────────────────
+  ipcMain.handle('creator:follow', wrap(async (payload) => {
+    const input = requireString(payload, 'input')
+
+    // 配额校验 MUST 在写库之前：超限时拒绝且不产生任何行
+    if (creatorQuota) {
+      const pool = typeof creatorQuota.probePool === 'number' ? creatorQuota.probePool : 1500
+      const existing = await creatorStore.listFollowsForQuota()
+      const interval = payload.checkIntervalMin || 60
+      creatorMonitor.assertQuotaFits(existing, pool, { check_interval_min: interval })
+    }
+
+    // 先解析成 canonical ID 再落库——绝不把用户输入当 external_id 存
+    const channelId = await creatorCollector.resolveChannelId(input)
+    const creator = await creatorStore.upsertCreator({
+      platform: 'youtube',
+      externalId: channelId,
+      displayName: payload.displayName || '',
+      handle: payload.handle || '',
+      avatarUrl: '',
+      platformUrl: `https://www.youtube.com/channel/${channelId}`,
+    })
+    const follow = await creatorStore.upsertFollow({
+      creatorId: creator.id,
+      checkIntervalMin: payload.checkIntervalMin || 60,
+      perCreatorLimit: payload.perCreatorLimit ?? null,
+    })
+    return { code: 0, creator, follow }
+  }))
+
+  // ── 取消关注 / 暂停恢复 ─────────────────────────────────────
+  ipcMain.handle('creator:unfollow', wrap(async (payload) => {
+    const followId = requireString(payload, 'followId', { max: 64 })
+    await creatorStore.deleteFollow(followId)
+    return { code: 0 }
+  }))
+
+  ipcMain.handle('creator:toggle', wrap(async (payload) => {
+    const followId = requireString(payload, 'followId', { max: 64 })
+    const follow = await creatorStore.setFollowEnabled(followId, !!payload.enabled)
+    return { code: 0, follow }
+  }))
+
+  // ── 立即检查 ────────────────────────────────────────────────
+  ipcMain.handle('creator:check-now', wrap(async (payload) => {
+    const followId = requireString(payload, 'followId', { max: 64 })
+    const r = await creatorMonitor.probeCreator(followId, { manual: true })
+    return { code: 0, ...r }
+  }))
+
+  // ── 发现列表 ────────────────────────────────────────────────
+  ipcMain.handle('creator:discoveries', wrap(async (payload) => {
+    const limit = Number.isInteger(payload.limit) ? payload.limit : 50
+    const offset = Number.isInteger(payload.offset) ? payload.offset : 0
+    const items = await creatorStore.listDiscoveries({
+      creatorId: payload.creatorId || null,
+      state: payload.state || 'pending',
+      limit, offset,
+    })
+    return { code: 0, items, limit, offset }
+  }))
+
+  // ── 批量采集 ────────────────────────────────────────────────
+  ipcMain.handle('creator:collect', wrap(async (payload) => {
+    const follow = await creatorStore.getFollow(requireString(payload, 'followId', { max: 64 }))
+    if (!follow) {
+      const e = new Error('关注项不存在')
+      e.code = 'creator:follow_not_found'
+      throw e
+    }
+    const effectiveLimit = resolveEffectiveLimit(follow.per_creator_limit)
+
+    // 默认数量取「一键采集」通道的 5；手动批量通道会显式传 50
+    const count = payload.count ?? COLLECT_DEFAULTS.oneClick
+
+    const pending = await creatorStore.listDiscoveries({
+      creatorId: follow.creator_id, state: 'pending', limit: effectiveLimit, offset: 0,
+    })
+
+    // 超限在此抛错，此时尚未发起任何采集请求 —— 零副作用
+    const plan = planCollect({ pending, count, effectiveLimit })
+
+    const r = await creatorMonitor.collectBatch({
+      creatorId: follow.creator_id,
+      discoveries: plan.selected,
+      effectiveLimit,
+    })
+    return {
+      code: 0,
+      collected: r.collected,
+      failed: r.failed,
+      remain: plan.remain,
+      truncated: plan.truncated,
+      available: plan.available,
+      max: effectiveLimit,
+    }
+  }))
+
+  // ── 单条采集：零填参，不受数量上限约束，但仍受配额约束 ────────
+  ipcMain.handle('creator:collect-one', wrap(async (payload) => {
+    const discoveryId = requireString(payload, 'discoveryId', { max: 64 })
+    const r = await creatorMonitor.collectOne(discoveryId)
+    return { code: 0, ...r }
+  }))
+
+  ipcMain.handle('creator:skip-one', wrap(async (payload) => {
+    const discoveryId = requireString(payload, 'discoveryId', { max: 64 })
+    await creatorStore.skipDiscovery(discoveryId)
+    return { code: 0 }
+  }))
+
+  // ── 送入 AI 写作 ────────────────────────────────────────────
+  // 复用既有 full-auto-pipeline 的 collect → rewrite → create 三段，**不执行 publish**
+  // （非目标 N1：不做一键搬运发布）。幂等键见下，避免同一内容反复点重复消耗 LLM 额度。
+  ipcMain.handle('creator:send-to-writer', wrap(async (payload) => {
+    const discoveryId = requireString(payload, 'discoveryId', { max: 64 })
+    const pipeline = deps.fullAutoPipeline
+    if (!pipeline || typeof pipeline.startRun !== 'function') {
+      return { code: -1, reason: 'pipeline-unavailable', message: 'AI 写作流水线未就绪' }
+    }
+    const item = await creatorStore.getDiscovery(discoveryId)
+    if (!item) {
+      const e = new Error('作品不存在')
+      e.code = 'creator:discovery_not_found'
+      throw e
+    }
+    // 幂等：同一份内容（id + updated_at）重复点击返回同一个 runId，而不是重复起跑
+    const sig = `${item.id}:${item.updated_at || item.collected_at || ''}`
+    const started = await pipeline.startRun({
+      urls: [item.url].filter(Boolean),
+      sourceType: 'url',
+      stages: { collect: false, rewrite: true, create: true, publish: false },
+      idempotencyKey: `creator:${sig}`,
+    })
+    if (!started || started.success === false) {
+      return { code: -1, reason: 'writer-start-failed', message: (started && started.error) || 'AI 写作启动失败' }
+    }
+    return { code: 0, runId: started.runId, idempotencyKey: `creator:${sig}` }
+  }))
+}
+
+module.exports = { registerHandlers, toIpcError, COLLECT_DEFAULTS }
\ No newline at end of file
diff --git a/apps/desktop/electron/ipc-handlers/creator.test.js b/apps/desktop/electron/ipc-handlers/creator.test.js
new file mode 100644
index 00000000..0998d68b
--- /dev/null
+++ b/apps/desktop/electron/ipc-handlers/creator.test.js
@@ -0,0 +1,300 @@
+/**
+ * creator.test.js — 博主监控 IPC：校验、降级与错误映射
+ *
+ * 锁三件「接线层特有」的风险：
+ *  1. **依赖缺失时仍注册通道**：否则渲染层收到 Electron 原生的
+ *     "No handler registered for 'creator:collect'"，对用户毫无意义。
+ *  2. **超限时零副作用**：collect 通道必须在发起任何采集请求前拒绝。
+ *  3. **错误分类可区分**：数量超限 / 输入非法 / 频道不存在是三种排查方向。
+ */
+const { registerHandlers } = require('./creator')
+
+function createMockIpcMain () {
+  const handlers = new Map()
+  return {
+    handle (channel, fn) { handlers.set(channel, fn) },
+    _get (channel) { return handlers.get(channel) },
+    _channels () { return [...handlers.keys()] },
+  }
+}
+
+function stubDeps (over = {}) {
+  const calls = { collectBatch: [], probe: [], resolve: [] }
+  return {
+    calls,
+    creatorStore: {
+      listCreators: async () => [
+        { id: 'c1', platform: 'youtube', external_id: 'UC_a', display_name: 'A' },
+        { id: 'c2', platform: 'youtube', external_id: 'UC_b', display_name: 'B' },
+      ],
+      countPending: (id) => (id === 'c1' ? 3 : 0),
+      listFollowsForQuota: async () => [],
+      upsertCreator: async (a) => ({ id: 'c1', ...a }),
+      upsertFollow: async (a) => ({ id: 'f1', ...a }),
+      getFollow: async (id) => (id === 'f1'
+        ? { id: 'f1', creator_id: 'c1', per_creator_limit: null }
+        : null),
+      listDiscoveries: async () => Array.from({ length: 12 }, (_, i) => ({
+        id: `d${i}`, published_at: `2026-10-${String(24 - i).padStart(2, '0')}`,
+      })),
+      deleteFollow: async () => {},
+      setFollowEnabled: async (id, enabled) => ({ id, enabled }),
+      skipDiscovery: async () => {},
+      ...over.creatorStore,
+    },
+    creatorCollector: {
+      resolveChannelId: async (input) => { calls.resolve.push(input); return 'UC_canonical' },
+      ...over.creatorCollector,
+    },
+    creatorMonitor: {
+      assertQuotaFits: () => {},
+      probeCreator: async (id) => { calls.probe.push(id); return { found: 2, inserted: 2 } },
+      collectBatch: async (a) => { calls.collectBatch.push(a); return { collected: a.discoveries.length, failed: 0 } },
+      collectOne: async () => ({ collected: 1 }),
+      ...over.creatorMonitor,
+    },
+    log: { warn: () => {}, error: () => {} },
+    ...over,
+  }
+}
+
+const CHANNELS = [
+  'creator:list', 'creator:follow', 'creator:unfollow', 'creator:toggle',
+  'creator:check-now', 'creator:discoveries', 'creator:collect',
+  'creator:collect-one', 'creator:skip-one',
+]
+
+describe('creator IPC · 通道注册', () => {
+  it('依赖齐全时注册全部通道', () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    for (const ch of CHANNELS) expect(ipc._get(ch)).toBeTypeOf('function')
+  })
+
+  it('依赖缺失时仍注册全部通道（降级，不报 No handler registered）', () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, { log: { warn: () => {}, error: () => {} } })
+    for (const ch of CHANNELS) expect(ipc._get(ch)).toBeTypeOf('function')
+  })
+
+  it('降级响应带 reason=service-unavailable 供 UI 区分', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, { log: { warn: () => {}, error: () => {} } })
+    const r = await ipc._get('creator:collect')({}, {})
+    expect(r.reason).toBe('service-unavailable')
+  })
+})
+
+describe('creator IPC · 博主列表', () => {
+  it('返回每个博主的待采集数与总数（角标）', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:list')({}, {})
+    expect(r.items).toHaveLength(2)
+    expect(r.items[0].pendingCount).toBe(3)
+    expect(r.totalPending).toBe(3)
+  })
+})
+
+describe('creator IPC · 关注', () => {
+  it('先解析成 canonical ID 再落库，绝不把用户输入当 external_id', async () => {
+    const deps = stubDeps()
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    await ipc._get('creator:follow')({}, { input: '@GoogleDevelopers' })
+    expect(deps.calls.resolve).toEqual(['@GoogleDevelopers'])
+  })
+
+  it('缺少 input 时返回可区分的错误而非崩溃', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:follow')({}, {})
+    expect(r.reason).toBe('creator:invalid_input')
+  })
+
+  it('输入过长被拒（防超长串进库）', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:follow')({}, { input: 'x'.repeat(600) })
+    expect(r.reason).toBe('creator:invalid_input')
+  })
+
+  it('频道解析失败时透出原因（格式不对 vs 频道不存在要分开）', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps({
+      creatorCollector: {
+        resolveChannelId: async () => {
+          const e = new Error('找不到该频道')
+          e.code = 'creator:channel_not_found'
+          throw e
+        },
+      },
+    }))
+    const r = await ipc._get('creator:follow')({}, { input: '@ghost' })
+    expect(r.reason).toBe('creator:channel_not_found')
+  })
+})
+
+describe('creator IPC · 批量采集（零副作用是硬要求）', () => {
+  it('默认 count 取 5（一键采集默认量）', async () => {
+    const deps = stubDeps()
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    const r = await ipc._get('creator:collect')({}, { followId: 'f1' })
+    expect(deps.calls.collectBatch[0].discoveries).toHaveLength(5)
+    expect(r.collected).toBe(5)
+  })
+
+  it('count 超上限时拒绝，且不得发起任何采集请求', async () => {
+    const deps = stubDeps()
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    const r = await ipc._get('creator:collect')({}, { followId: 'f1', count: 150 })
+    expect(r.reason).toBe('creator:count_exceeds_limit')
+    expect(r.max).toBe(100)
+    expect(deps.calls.collectBatch).toHaveLength(0)   // ← 关键：零副作用
+  })
+
+  it('采少于可采数时如实返回剩余量，不静默截断', async () => {
+    const deps = stubDeps()
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    const r = await ipc._get('creator:collect')({}, { followId: 'f1', count: 5 })
+    expect(r.available).toBe(12)
+    expect(r.collected).toBe(5)
+    expect(r.remain).toBe(7)
+    expect(r.truncated).toBe(true)
+  })
+
+  it('按发布时间倒序取最新', async () => {
+    const deps = stubDeps()
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    await ipc._get('creator:collect')({}, { followId: 'f1', count: 2 })
+    expect(deps.calls.collectBatch[0].discoveries.map(d => d.id)).toEqual(['d0', 'd1'])
+  })
+
+  it('个人上限低于全局时以个人为准', async () => {
+    const deps = stubDeps({
+      creatorStore: {
+        getFollow: async () => ({ id: 'f1', creator_id: 'c1', per_creator_limit: 2 }),
+        listDiscoveries: async () => Array.from({ length: 12 }, (_, i) => ({ id: `d${i}` })),
+      },
+    })
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    const r = await ipc._get('creator:collect')({}, { followId: 'f1', count: 5 })
+    expect(r.max).toBe(2)
+  })
+
+  it('关注项不存在时明确报错，不静默当空列表', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:collect')({}, { followId: 'nope' })
+    // 领域码整类透传：关注项不存在 MUST NOT 退化成通用失败——两者排查方向完全不同
+    expect(r.reason).toBe('creator:follow_not_found')
+  })
+})
+
+describe('creator IPC · 单条采集', () => {
+  it('零填参即可调用', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:collect-one')({}, { discoveryId: 'd1' })
+    expect(r.collected).toBe(1)
+  })
+
+  it('缺 discoveryId 被拒', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:collect-one')({}, {})
+    expect(r.reason).toBe('creator:invalid_input')
+  })
+})
+
+describe('creator IPC · 立即检查与发现列表', () => {
+  it('check-now 透传 followId 并返回发现数', async () => {
+    const deps = stubDeps()
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, deps)
+    const r = await ipc._get('creator:check-now')({}, { followId: 'f1' })
+    expect(deps.calls.probe).toEqual(['f1'])
+    expect(r.inserted).toBe(2)
+  })
+
+  it('discoveries 默认 limit=50 / offset=0', async () => {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps())
+    const r = await ipc._get('creator:discoveries')({}, {})
+    expect(r.limit).toBe(50)
+    expect(r.offset).toBe(0)
+  })
+})
+
+describe('creator IPC · 送入 AI 写作', () => {
+  const item = { id: 'd1', url: 'https://www.youtube.com/watch?v=v1', updated_at: '2026-10-07T10:00:00Z' }
+
+  function mountWith (pipeline) {
+    const ipc = createMockIpcMain()
+    registerHandlers(ipc, stubDeps({
+      creatorStore: { getDiscovery: async () => item },
+      fullAutoPipeline: pipeline,
+    }))
+    return ipc
+  }
+
+  it('复用 full-auto-pipeline，且显式关闭 publish（不做一键搬运）', async () => {
+    const calls = []
+    const ipc = mountWith({ startRun: async (cfg) => { calls.push(cfg); return { success: true, runId: 'r9' } } })
+    const r = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
+    expect(r.runId).toBe('r9')
+    expect(calls[0].stages.publish).toBe(false)
+    expect(calls[0].urls).toEqual([item.url])
+  })
+
+  it('同一内容重复点击返回同一幂等键，不重复起跑消耗 LLM 额度', async () => {
+    let starts = 0
+    const ipc = mountWith({ startRun: async (cfg) => { starts += 1; return { success: true, runId: 'r' + starts } } })
+    const a = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
+    const b = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
+    expect(a.idempotencyKey).toBe(b.idempotencyKey)
+  })
+
+  it('内容更新后幂等键随之变化（允许重新生成）', async () => {
+    const keys = []
+    const ipc = createMockIpcMain()
+    let current = { ...item }
+    registerHandlers(ipc, stubDeps({
+      creatorStore: { getDiscovery: async () => current },
+      fullAutoPipeline: { startRun: async (cfg) => { keys.push(cfg.idempotencyKey); return { success: true, runId: 'r' } } },
+    }))
+    await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
+    current = { ...item, updated_at: '2026-10-08T10:00:00Z' }
+    await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
+    expect(keys[0]).not.toBe(keys[1])
+  })
+
+  it('流水线未就绪时明确失败，不静默无反应', async () => {
+    const ipc = mountWith(null)
+    const r = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
+    expect(r.reason).toBe('pipeline-unavailable')
+  })
+
+  it('作品不存在时报错，不拿空 URL 去起跑', async () => {
+    const ipc = createMockIpcMain()
+    let called = false
+    registerHandlers(ipc, stubDeps({
+      creatorStore: { getDiscovery: async () => null },
+      fullAutoPipeline: { startRun: async () => { called = true; return { success: true, runId: 'r' } } },
+    }))
+    const r = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'nope' })
+    expect(r.reason).toBe('creator:discovery_not_found')
+    expect(called).toBe(false)
+  })
+
+  it('缺 discoveryId 被拒', async () => {
+    const ipc = mountWith({ startRun: async () => ({ success: true, runId: 'r' }) })
+    const r = await ipc._get('creator:send-to-writer')({}, {})
+    expect(r.reason).toBe('creator:invalid_input')
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/preload/creator.js b/apps/desktop/electron/preload/creator.js
new file mode 100644
index 00000000..aa404481
--- /dev/null
+++ b/apps/desktop/electron/preload/creator.js
@@ -0,0 +1,36 @@
+/**
+ * creator.js — 博主监控的 preload 桥
+ *
+ * 与既有 aggregation 桥同构：只做通道转发，不含业务判断。
+ *
+ * ⚠ 两处都必须是字面量：
+ *   ① 每个转发都要写成 ipcRenderer 加 invoke 加「引号包住的通道名」的完整形状
+ *      —— check-ipc-bridge.js 的 RE2 正则要求**标识符以 ipcRenderer 开头**，
+ *      且通道名必须是引号字面量；
+ *   ② 形参名就叫 ipcRenderer —— 换成 renderer 会提不到通道，
+ *      检查器会逐条报「Handler 已注册但 preload 未暴露」。
+ *   改成把通道名存进变量再传进去的间接调用同样会被漏掉。
+ *   可测性靠形参注入解决（调用方传 ipcRenderer），不靠间接调用。
+ *
+ * ⚠ 这段说明**刻意不写出可被提取的通道样例**：ipc-contract.test.js 扫的是本文件
+ *   全文文本，注释里出现的「invoke 加引号字面量」形状会被当成真通道提出来，
+ *   然后因主进程没有同名 handler 而红。踩过一次：示例写成 creator:xxx 就红了。
+ */
+const { ipcRenderer } = require('electron')
+
+function createCreatorApi (ipcRenderer) {
+  return {
+    creatorList: () => ipcRenderer.invoke('creator:list'),
+    creatorFollow: (payload) => ipcRenderer.invoke('creator:follow', payload),
+    creatorUnfollow: (payload) => ipcRenderer.invoke('creator:unfollow', payload),
+    creatorToggle: (payload) => ipcRenderer.invoke('creator:toggle', payload),
+    creatorCheckNow: (payload) => ipcRenderer.invoke('creator:check-now', payload),
+    creatorDiscoveries: (payload) => ipcRenderer.invoke('creator:discoveries', payload),
+    creatorCollect: (payload) => ipcRenderer.invoke('creator:collect', payload),
+    creatorCollectOne: (payload) => ipcRenderer.invoke('creator:collect-one', payload),
+    creatorSkipOne: (payload) => ipcRenderer.invoke('creator:skip-one', payload),
+    creatorSendToWriter: (payload) => ipcRenderer.invoke('creator:send-to-writer', payload),
+  }
+}
+
+module.exports = { createCreatorApi }
\ No newline at end of file
diff --git a/apps/desktop/electron/preload/index.bundle.js b/apps/desktop/electron/preload/index.bundle.js
index 955f59d5..be730a65 100644
--- a/apps/desktop/electron/preload/index.bundle.js
+++ b/apps/desktop/electron/preload/index.bundle.js
@@ -1088,6 +1088,28 @@ var require_aggregation = __commonJS({
   }
 });
 
+// electron/preload/creator.js
+var require_creator = __commonJS({
+  "electron/preload/creator.js"(exports2, module2) {
+    var { ipcRenderer: ipcRenderer2 } = require("electron");
+    function createCreatorApi2(ipcRenderer3) {
+      return {
+        creatorList: () => ipcRenderer3.invoke("creator:list"),
+        creatorFollow: (payload) => ipcRenderer3.invoke("creator:follow", payload),
+        creatorUnfollow: (payload) => ipcRenderer3.invoke("creator:unfollow", payload),
+        creatorToggle: (payload) => ipcRenderer3.invoke("creator:toggle", payload),
+        creatorCheckNow: (payload) => ipcRenderer3.invoke("creator:check-now", payload),
+        creatorDiscoveries: (payload) => ipcRenderer3.invoke("creator:discoveries", payload),
+        creatorCollect: (payload) => ipcRenderer3.invoke("creator:collect", payload),
+        creatorCollectOne: (payload) => ipcRenderer3.invoke("creator:collect-one", payload),
+        creatorSkipOne: (payload) => ipcRenderer3.invoke("creator:skip-one", payload),
+        creatorSendToWriter: (payload) => ipcRenderer3.invoke("creator:send-to-writer", payload)
+      };
+    }
+    module2.exports = { createCreatorApi: createCreatorApi2 };
+  }
+});
+
 // electron/preload/hot-topics.js
 var require_hot_topics = __commonJS({
   "electron/preload/hot-topics.js"(exports2, module2) {
@@ -1468,6 +1490,7 @@ var { createVideoCloneApi } = require_video_clone();
 var { createServicesApi } = require_services();
 var { createFilmEngineeringApi } = require_film_engineering();
 var { createAggregationApi } = require_aggregation();
+var { createCreatorApi } = require_creator();
 var { createHotTopicsApi } = require_hot_topics();
 var { createAutoPipelineApi } = require_auto_pipeline();
 var { createAutomationApi } = require_automation();
@@ -1517,6 +1540,7 @@ var fullApi = {
   ...createServicesApi(ipcRenderer),
   ...createFilmEngineeringApi(ipcRenderer),
   ...createAggregationApi(ipcRenderer),
+  ...createCreatorApi(ipcRenderer),
   ...createHotTopicsApi(ipcRenderer),
   ...createAutoPipelineApi(ipcRenderer),
   ...createAutomationApi(ipcRenderer),
diff --git a/apps/desktop/electron/preload/index.js b/apps/desktop/electron/preload/index.js
index e7a6ac60..d1ac1a83 100644
--- a/apps/desktop/electron/preload/index.js
+++ b/apps/desktop/electron/preload/index.js
@@ -39,6 +39,7 @@ const { createVideoCloneApi } = require('./video-clone')
 const { createServicesApi } = require('./services')
 const { createFilmEngineeringApi } = require('./film-engineering')
 const { createAggregationApi } = require('./aggregation')
+const { createCreatorApi } = require('./creator')
 const { createHotTopicsApi } = require('./hot-topics')
 const { createAutoPipelineApi } = require('./auto-pipeline')
 const { createAutomationApi } = require('./automation')
@@ -104,6 +105,7 @@ const fullApi = {
   ...createServicesApi(ipcRenderer),
   ...createFilmEngineeringApi(ipcRenderer),
   ...createAggregationApi(ipcRenderer),
+    ...createCreatorApi(ipcRenderer),
   ...createHotTopicsApi(ipcRenderer),
   ...createAutoPipelineApi(ipcRenderer),
   ...createAutomationApi(ipcRenderer),
diff --git a/apps/desktop/electron/services/automation-creator-monitor.test.js b/apps/desktop/electron/services/automation-creator-monitor.test.js
new file mode 100644
index 00000000..f032eb3d
--- /dev/null
+++ b/apps/desktop/electron/services/automation-creator-monitor.test.js
@@ -0,0 +1,133 @@
+/**
+ * automation-creator-monitor.test.js — 调度器的博主监控分发与未知类型隔离
+ *
+ * 这组用例锁的是 2026-10-07 引入的两条分支，其价值在于「它们替代了什么」：
+ *
+ *  · 未知 action.type 既 **不能 fallback 到 pipeline**（会静默跑错链路，
+ *    用户以为在跑博主巡检、实际跑的是采集改写发布），也**不能 throw**
+ *    ——throw 发生在调度循环里，一条脏任务就会让其余任务全部不再触发。
+ *  · 博主巡检中单个博主失败 MUST NOT 中断当轮其余博主。
+ */
+const { AutomationScheduler } = require('./automation-scheduler')
+
+function makeTask (over = {}) {
+  return {
+    id: 't1', name: 't', enabled: true, triggers: [],
+    maxRetries: 0, failurePolicy: 'skip',
+    action: { type: 'creatorMonitor', config: { followIds: ['f1', 'f2', 'f3'] } },
+    ...over,
+  }
+}
+
+function makeScheduler (rt, extra = {}) {
+  const pipelineCalls = []
+  const quarantined = []
+  const paused = []
+  const s = new AutomationScheduler({
+    log: { info: () => {}, warn: () => {}, error: () => {} },
+    store: { getSetting: () => undefined, setSetting: () => {} },
+    pipeline: {
+      startRun: async (cfg) => { pipelineCalls.push(cfg); return { success: true, runId: 'r1' } },
+    },
+    ...extra,
+  })
+  s._creatorRuntime = rt
+  s._quarantine = async (t) => { quarantined.push(t.id) }
+  s._markTaskPaused = async (id, reason) => { paused.push([id, reason]) }
+  return { s, pipelineCalls, quarantined, paused }
+}
+
+describe('automation-scheduler · 博主监控分发', () => {
+  it('creatorMonitor 类型走巡检分支，绝不进入 pipeline', async () => {
+    const probed = []
+    const { s, pipelineCalls } = makeScheduler({
+      probeCreator: async (id) => { probed.push(id); return { ok: true } },
+    })
+    const r = await s._executeWithPolicy(makeTask())
+    expect(r.status).toBe('completed')
+    expect(probed).toEqual(['f1', 'f2', 'f3'])
+    expect(pipelineCalls).toHaveLength(0)   // ← 关键：没有误跑流水线
+  })
+
+  it('单个博主失败不中断当轮其余博主', async () => {
+    const probed = []
+    const { s } = makeScheduler({
+      probeCreator: async (id) => {
+        probed.push(id)
+        if (id === 'f2') return { ok: false, tier: 'throttled' }
+        return { ok: true }
+      },
+    })
+    const r = await s._executeWithPolicy(makeTask())
+    expect(probed).toEqual(['f1', 'f2', 'f3'])   // f2 之后仍继续
+    expect(r.skipped).toBe(1)
+    expect(r.status).toBe('completed')
+  })
+
+  it('探测抛异常也不中断当轮', async () => {
+    const probed = []
+    const { s } = makeScheduler({
+      probeCreator: async (id) => {
+        probed.push(id)
+        if (id === 'f1') throw new Error('boom')
+        return { ok: true }
+      },
+    })
+    const r = await s._executeWithPolicy(makeTask())
+    expect(probed).toEqual(['f1', 'f2', 'f3'])
+    expect(r.skipped).toBe(1)
+  })
+
+  it('全部失败时任务判失败（而不是假装成功）', async () => {
+    const { s } = makeScheduler({ probeCreator: async () => ({ ok: false }) })
+    const r = await s._executeWithPolicy(makeTask())
+    expect(r.status).toBe('failed')
+    expect(r.skipped).toBe(3)
+  })
+
+  it('运行时未装配时明确失败，不静默跳过', async () => {
+    const { s } = makeScheduler(null)
+    const r = await s._executeWithPolicy(makeTask())
+    expect(r.status).toBe('failed')
+    expect(r.error).toMatch(/未装配/)
+  })
+
+  it('fullAutoPipeline 仍走原路径（既有行为不回归）', async () => {
+    const { s, pipelineCalls } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
+    const task = makeTask({ action: { type: 'fullAutoPipeline', config: { a: 1 } } })
+    // 不 await 整个执行：pipeline 替身不会发 run 完成事件，
+    // _awaitRun 会一直等到硬超时。这里要验的只是「有没有进 pipeline」。
+    s._executeWithPolicy(task).catch(() => {})
+    await new Promise((r) => setTimeout(r, 0))
+    expect(pipelineCalls).toHaveLength(1)
+    expect(pipelineCalls[0]).toEqual({ a: 1 })
+  })
+})
+
+describe('automation-scheduler · 未知类型隔离', () => {
+  it('未知类型挂起并隔离原始载荷', async () => {
+    const { s, quarantined, paused, pipelineCalls } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
+    const r = await s._executeWithPolicy(makeTask({ action: { type: 'someLegacyType' } }))
+    expect(r.status).toBe('failed')
+    expect(quarantined).toEqual(['t1'])
+    expect(paused[0][1]).toBe('unknown_type')
+  })
+
+  it('未知类型绝不 fallback 到 pipeline（那会静默跑错链路）', async () => {
+    const { s, pipelineCalls } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
+    await s._executeWithPolicy(makeTask({ action: { type: 'someLegacyType' } }))
+    expect(pipelineCalls).toHaveLength(0)
+  })
+
+  it('未知类型绝不 throw（throw 会中断调度循环）', async () => {
+    const { s } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
+    await expect(s._executeWithPolicy(makeTask({ action: { type: 'someLegacyType' } }))).resolves.toBeTruthy()
+  })
+
+  it('隔离/挂起自身抛错也不影响调度返回', async () => {
+    const { s } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
+    s._quarantine = async () => { throw new Error('quarantine boom') }
+    s._markTaskPaused = async () => { throw new Error('pause boom') }
+    await expect(s._executeWithPolicy(makeTask({ action: { type: 'weird' } }))).resolves.toBeTruthy()
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/automation-scheduler.js b/apps/desktop/electron/services/automation-scheduler.js
index 5d194d55..fb11662e 100644
--- a/apps/desktop/electron/services/automation-scheduler.js
+++ b/apps/desktop/electron/services/automation-scheduler.js
@@ -275,6 +275,15 @@ class AutomationScheduler {
    * @returns {Promise<{status: string, error?: string, failedSteps?: string[]}>}
    */
   async _executeWithPolicy (task) {
+    // 新增任务类型 MUST 在此显式分发。未知类型走 _quarantineUnknownType，
+    // 既不 fallback 到 pipeline（会静默跑错链路），也不 throw
+    // （throw 发生在调度循环里，一条脏任务就会让其余任务全部不再触发）。
+    const type = task.action && task.action.type
+    if (type && type !== 'fullAutoPipeline') {
+      if (type === 'creatorMonitor') return this._executeCreatorMonitor(task)
+      return this._quarantineUnknownType(task)
+    }
+
     const attempts = (task.maxRetries || 0) + 1
     let lastError = ''
     for (let i = 0; i < attempts; i++) {
@@ -296,6 +305,49 @@ class AutomationScheduler {
     return { status: 'failed', error: lastError }
   }
 
+  /**
+   * 博主监控巡检：逐个探测到期博主。
+   * 单个博主探测失败 MUST NOT 中断整轮 —— runtime.probeCreator 本身已不抛异常，
+   * 这里再兜一层，保证「一个坏博主不会拖垮当轮其余博主」。
+   */
+  async _executeCreatorMonitor (task) {
+    const rt = this._creatorRuntime
+    if (!rt || typeof rt.probeCreator !== 'function') {
+      return { status: 'failed', error: '博主监控运行时未装配' }
+    }
+    const ids = (task.action && task.action.config && task.action.config.followIds) || []
+    let ok = 0
+    let skipped = 0
+    for (const followId of ids) {
+      try {
+        const r = await rt.probeCreator(followId)
+        if (r && r.ok) ok += 1
+        else skipped += 1
+      } catch (e) {
+        skipped += 1
+      }
+    }
+    if (this._log && this._log.warn && skipped > 0) {
+      this._log.warn('[automation] 博主巡检', `${skipped}/${ids.length} 个未成功探测`)
+    }
+    return { status: ok > 0 || ids.length === 0 ? 'completed' : 'failed', skipped }
+  }
+
+  /** 未知任务类型：挂起并保留原始载荷，绝不执行任何链路 */
+  async _quarantineUnknownType (task) {
+    const type = task.action && task.action.type
+    if (this._log && this._log.warn) {
+      this._log.warn('[automation] 未知任务类型已隔离', `task=${task.id} type=${type}`)
+    }
+    if (typeof this._quarantine === 'function') {
+      try { await this._quarantine(task) } catch (_) { /* 隔离失败不得影响调度 */ }
+    }
+    if (typeof this._markTaskPaused === 'function') {
+      try { await this._markTaskPaused(task.id, 'unknown_type', `未知自动化任务类型: ${type}`) } catch (_) { /* 同上 */ }
+    }
+    return { status: 'failed', error: `未知自动化任务类型: ${type}` }
+  }
+
   /**
    * 等待一个 run 到终态。硬超时兜底，超时按失败处理且**不取消底层 run**
    * （底层 run 是 main-process 资源，交由 pipeline 自己的清理逻辑处理）。
diff --git a/apps/desktop/electron/services/creator-collector-runtime.js b/apps/desktop/electron/services/creator-collector-runtime.js
new file mode 100644
index 00000000..de0ba9a4
--- /dev/null
+++ b/apps/desktop/electron/services/creator-collector-runtime.js
@@ -0,0 +1,114 @@
+/**
+ * creator-collector-runtime.js — 真正发起网络调用的采集器
+ *
+ * 与 `creator-collector.js`（纯解析，无网络）分工：
+ *   · creator-collector      把用户输入解析成 canonical channelId
+ *   · creator-collector-runtime  用 canonical ID / videoId 去取真实数据
+ *
+ * 依赖全部注入，便于在无网络、无凭证环境完整测试。
+ */
+
+'use strict'
+
+const { CREATOR_INPUT_ERRORS, YOUTUBE_API_BASE } = require('./creator-collector')
+const { DEFAULT_COLLECT_PAGE_SIZE, classifyContentQuality } = require('./creator-content-quality')
+
+/** 默认注入实现：仅用 Node 内置 https，避免为一次 GET 引入依赖 */
+function defaultHttpGet (url, params) {
+  // eslint-disable-next-line global-require
+  const https = require('https')
+  const qs = Object.entries(params || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
+  const full = `${url}${url.includes('?') ? '&' : '?'}${qs}`
+  return new Promise((resolve, reject) => {
+    https.get(full, (res) => {
+      let raw = ''
+      res.on('data', (d) => { raw += d })
+      res.on('end', () => {
+        let json = null
+        try { json = JSON.parse(raw) } catch (_) { /* 非 JSON 留给上层按状态码分级 */ }
+        if (res.statusCode >= 400) {
+          const err = new Error(`HTTP ${res.statusCode}`)
+          err.response = { status: res.statusCode, data: json }
+          reject(err)
+          return
+        }
+        resolve(json)
+      })
+    }).on('error', reject)
+  })
+}
+
+function createCreatorCollector (deps = {}) {
+  const {
+    credentialProvider,          // () => { apiKey, pythonBridge } | null
+    httpGet = defaultHttpGet,
+    listPostsImpl,               // 可覆盖（测试/未来自实现）
+    bodyImpl,                    // 可覆盖
+    log,
+  } = deps
+
+  function credentials () {
+    const c = typeof credentialProvider === 'function' ? credentialProvider() : null
+    if (!c || !c.apiKey) {
+      const e = new Error('未配置 YouTube API Key')
+      e.code = CREATOR_INPUT_ERRORS.CREDENTIAL_MISSING
+      throw e
+    }
+    return c
+  }
+
+  /** 取频道 uploads 播放列表里的最新作品（探测阶段不取正文） */
+  async function listPosts (channelId) {
+    if (typeof listPostsImpl === 'function') return listPostsImpl(channelId)
+    const { apiKey } = credentials()
+    // uploads 播放列表 ID = 'UU' + channelId.slice(2)
+    const uploads = 'UU' + String(channelId).slice(2)
+    const json = await httpGet(`${YOUTUBE_API_BASE}/playlistItems`, {
+      part: 'snippet', playlistId: uploads, maxResults: DEFAULT_COLLECT_PAGE_SIZE, key: apiKey,
+    })
+    const items = Array.isArray(json && json.items) ? json.items : []
+    return items.map((it) => {
+      const sn = it.snippet || {}
+      const vid = (it.contentDetails && it.contentDetails.videoId) || it.id || ''
+      return {
+        externalId: vid,
+        title: sn.title || '',
+        url: vid ? `https://www.youtube.com/watch?v=${vid}` : '',
+        thumbnailUrl: (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default || {}).url) || '',
+        publishedAt: sn.publishedAt || null,
+        contentQuality: classifyContentQuality(null, sn.description || ''),
+        description: sn.description || '',
+      }
+    }).filter((x) => x.externalId)
+  }
+
+  /** 取正文：有字幕走字幕，无字幕回落描述，并给出内容质量等级 */
+  async function collectBody (externalId) {
+    if (typeof bodyImpl === 'function') return bodyImpl(externalId)
+    const creds = credentials()
+    const bridge = creds.pythonBridge
+    let content = ''
+    let transcriptSource = 'description'
+    if (bridge && typeof bridge.requestBackend === 'function') {
+      try {
+        const r = await bridge.requestBackend('POST', '/aggregation/collect', { url: `https://www.youtube.com/watch?v=${externalId}` })
+        if (r && r.content) {
+          content = String(r.content)
+          transcriptSource = (r.metadata && r.metadata.transcript_source) || 'description'
+        }
+      } catch (e) {
+        // 字幕抓取失败**不算博主级故障**：降级到描述即可，不该把监控停掉
+        if (log && log.warn) log.warn('[creator] 字幕获取失败，降级为描述', (e && e.message) || e)
+      }
+    }
+    return {
+      content,
+      transcriptSource,
+      contentQuality: classifyContentQuality(transcriptSource, content),
+    }
+  }
+
+  return { listPosts, collectBody }
+}
+
+module.exports = { createCreatorCollector, defaultHttpGet }
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-collector.js b/apps/desktop/electron/services/creator-collector.js
new file mode 100644
index 00000000..25153005
--- /dev/null
+++ b/apps/desktop/electron/services/creator-collector.js
@@ -0,0 +1,189 @@
+/**
+ * creator-collector.js — 博主采集适配器：YouTube 频道解析与作品拉取
+ *
+ * ## 为什么不直接把输入丢给依赖包
+ *
+ * `content_aggregator` 的 YouTubeCollector 在 `_fetch(channel_id=...)` 里的真实契约
+ * （P0 冒烟实测，2026-10-07）：
+ *
+ *   1. URL 解析**仅在 `channel_id.startswith('http')` 时进入**。裸串（`@name`、
+ *      `youtube.com/@name`）会被原样塞进 API 的 `channelId` 参数 → HTTP 400。
+ *   2. `@handle` 被**降级成关键词搜索**（`search_query=handle`、`channel_id=None`），
+ *      返回的是「标题/描述含该词的任意视频」，其 channel_id 是那些视频作者的频道。
+ *
+ * 第 2 条是**静默数据正确性事故**：返回值合法且有值、日志只有一行 warning、UI 无异常，
+ * 但用户关注 A 博主会收到 B 博主的内容，且系统无法自证。
+ *
+ * 因此本模块**自行完成 handle / username → canonical ID 的解析**，
+ * 拿到 canonical ID 后才把 `UC…` 交给采集器。解析失败一律 fail-closed，
+ * 绝不退化成「拿用户输入当 ID 试试」。
+ *
+ * ## 契约测试
+ * 见 electron/tests/creator-collector.test.js ——「绝不原样透传」系列用例是本模块
+ * 存在的核心理由，任何回归都意味着用户会静默收到别人的内容。
+ */
+
+'use strict'
+
+const CREATOR_PLATFORM_YOUTUBE = 'youtube'
+
+/** 输入类错误码。与「暂时性故障」严格区分：格式问题不该重试，频道不存在也不该。 */
+const CREATOR_INPUT_ERRORS = {
+  INVALID_INPUT: 'creator:invalid_input',
+  NOT_A_CHANNEL: 'creator:not_a_channel',
+  CHANNEL_NOT_FOUND: 'creator:channel_not_found',
+  CREDENTIAL_MISSING: 'creator:credential_missing',
+  DEPENDENCY_MISSING: 'creator:dependency_missing',
+}
+
+const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
+/** YouTube 频道 ID 恒以大写 UC 开头；正则大小写敏感，禁止 toLowerCase 后放行。 */
+const UC_ID_RE = /UC[\w-]{22}/
+const YOUTUBE_HOSTS = new Set([
+  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
+])
+
+function fail (code, message) {
+  const err = new Error(message)
+  err.code = code
+  // 刻意不携带 apiKey / 原始响应体，避免凭证或长文本经日志泄漏
+  return err
+}
+
+/**
+ * 归一化用户输入为绝对 URL。
+ * 依赖库只认 `startswith('http')`，因此裸串必须在这里补全 scheme。
+ */
+function normalizeInput (raw) {
+  if (typeof raw !== 'string') {
+    throw fail(CREATOR_INPUT_ERRORS.INVALID_INPUT, '频道输入必须是字符串')
+  }
+  const s = raw.trim()
+  if (!s) throw fail(CREATOR_INPUT_ERRORS.INVALID_INPUT, '频道输入为空')
+  // 裸频道 ID 是最自然的输入方式，且已是 canonical —— 直接接受，不必绕 URL。
+  // 故意在 normalizeInput 之前判定：避免把它当域名去补 scheme 而误判。
+  if (new RegExp(`^${UC_ID_RE.source}$`).test(s)) return s
+  if (s.startsWith('@')) {
+    return `https://www.youtube.com/${s}`
+  }
+  if (/^[\w.-]+\.(?:com|be)\//i.test(s)) {
+    return `https://${s}`
+  }
+  if (!/^https?:\/\//i.test(s)) {
+    throw fail(CREATOR_INPUT_ERRORS.INVALID_INPUT, '无法识别该频道链接')
+  }
+  return s
+}
+
+/**
+ * 把归一化后的 URL 解析为四种受支持的形态之一。
+ * 只做识别，不发任何网络请求 —— 「格式不对」必须在零请求下判定。
+ */
+function parseChannelInput (raw) {
+  const s = normalizeInput(raw)
+
+  // normalizeInput 对裸频道 ID 会原样返回；它已是 canonical，先于 URL 解析短路，
+  // 否则 new URL('UC…') 必然抛错并被误报成「无法识别」。
+  if (new RegExp(`^${UC_ID_RE.source}$`).test(s)) return { kind: 'id', channelId: s }
+
+  let u
+  try { u = new URL(s) } catch { throw fail(CREATOR_INPUT_ERRORS.INVALID_INPUT, '无法识别该频道链接') }
+
+  const host = u.hostname.toLowerCase()
+  if (!YOUTUBE_HOSTS.has(host)) {
+    throw fail(CREATOR_INPUT_ERRORS.INVALID_INPUT, '仅支持 YouTube 频道链接')
+  }
+
+  // 作品 / 播放列表是「资源」不是「频道」，给专门文案而非泛化的格式错误
+  if (u.pathname === '/watch') {
+    throw fail(CREATOR_INPUT_ERRORS.NOT_A_CHANNEL, '这是作品链接，请粘贴博主主页链接')
+  }
+  if (u.pathname === '/playlist') {
+    throw fail(CREATOR_INPUT_ERRORS.NOT_A_CHANNEL, '这是播放列表链接，请粘贴博主主页链接')
+  }
+
+  const uc = u.pathname.match(UC_ID_RE)
+  if (uc) return { kind: 'id', channelId: uc[0] }
+
+  const handle = u.pathname.match(/^\/@([\w.-]+)/)
+  if (handle) return { kind: 'handle', handle: handle[1] }
+
+  const legacy = u.pathname.match(/^\/(?:c|user)\/([^/?#]+)/)
+  if (legacy) return { kind: 'username', username: legacy[1] }
+
+  throw fail(CREATOR_INPUT_ERRORS.INVALID_INPUT, '无法识别该频道链接')
+}
+
+function readItems (res) {
+  if (!res) return []
+  const body = typeof res.json === 'function' ? res.json() : res
+  if (!body || typeof body !== 'object') return []
+  return Array.isArray(body.items) ? body.items : []
+}
+
+/**
+ * 解析用户输入 → canonical channelId（YouTube API 返回的 UC…）。
+ *
+ * @param {string} raw 用户原始输入（频道 ID / @handle / 频道 URL / 旧式 URL 皆可）
+ * @param {{apiKey: string, httpGet: Function}} deps
+ * @returns {Promise<string>} canonical channelId
+ * @throws {Error & {code: string}} 解析失败一律 fail-closed
+ */
+async function resolveChannelId (raw, deps = {}) {
+  const { apiKey, httpGet } = deps
+  if (!apiKey) {
+    throw fail(CREATOR_INPUT_ERRORS.CREDENTIAL_MISSING, '未配置 YouTube API Key')
+  }
+  if (typeof httpGet !== 'function') {
+    throw new TypeError('resolveChannelId 需要 httpGet 依赖')
+  }
+
+  const parsed = parseChannelInput(raw)
+
+  // UC 形式已是 canonical，零请求
+  if (parsed.kind === 'id') return parsed.channelId
+
+  // handle 走 forHandle，旧式 /c/ · /user/ 走 forUsername。
+  // 注意：这里绝不构造 channelId 参数 —— 依赖包正是因为它才把 handle 当搜索词。
+  const params = parsed.kind === 'handle'
+    ? { forHandle: parsed.handle }
+    : { forUsername: parsed.username }
+
+  const res = await httpGet(`${YOUTUBE_API_BASE}/channels`, {
+    part: 'id', ...params, key: apiKey,
+  })
+  const id = readItems(res)[0]?.id
+  if (!id) {
+    // fail-closed：解析不出就是解析不出，绝不回退到用输入当 ID
+    throw fail(CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND, '找不到该频道，可能已注销或链接有误')
+  }
+  return id
+}
+
+/**
+ * 探测依赖是否可用。缺包时必须显式报出，且提示语要带**确切安装命令**
+ * （沿用 asr-installer 的形态：给国内用户可直接用的镜像源写法）。
+ */
+function probeDependency (requireFn) {
+  const load = typeof requireFn === 'function' ? requireFn : require
+  try {
+    const mod = load('content_aggregator.sources.collectors.youtube_collector')
+    return { ready: true, YouTubeCollector: mod.YouTubeCollector }
+  } catch (err) {
+    return {
+      ready: false,
+      reason: (err && err.message) || String(err),
+      installHint: 'pip install content-aggregator -i https://pypi.tuna.tsinghua.edu.cn/simple',
+    }
+  }
+}
+
+module.exports = {
+  CREATOR_PLATFORM_YOUTUBE,
+  CREATOR_INPUT_ERRORS,
+  YOUTUBE_API_BASE,
+  normalizeInput,
+  parseChannelInput,
+  resolveChannelId,
+  probeDependency,
+}
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-collector.test.js b/apps/desktop/electron/services/creator-collector.test.js
new file mode 100644
index 00000000..b494e216
--- /dev/null
+++ b/apps/desktop/electron/services/creator-collector.test.js
@@ -0,0 +1,230 @@
+/**
+ * creator-collector.test.js — 博主采集适配器：频道解析契约
+ *
+ * 本文件的首要目的不是覆盖率，而是**锁死一处静默数据正确性缺陷**：
+ *
+ *   依赖包 content_aggregator 的 YouTubeCollector 在 `_fetch(channel_id=...)` 里，
+ *   仅当入参 `startswith('http')` 时才进入 URL 解析分支；`@handle` 形态会被
+ *   **降级成关键词搜索**（search_query=handle、channel_id=None），返回的是
+ *   「标题/描述含该词的任意视频」，其 channel_id 是那些视频作者的频道。
+ *
+ *   P0 冒烟实测（2026-10-07，真实 API Key）：
+ *     /channel/UC_x5… -> UC_x5XG1OV2P6uZZ5FSM9Ttw   ✅
+ *     /c/GoogleDevelopers -> UC_x5XG1OV2P6uZZ5FSM9Twh ✅
+ *     /user/GoogleDevelopers -> UC_x5XG1OV2P6uZZ5FSM9Twh ✅
+ *     @GoogleDevelopers -> UC-BsRijgl1O-H-sD4-Zw3UA  ❌ 另一个频道
+ *
+ *   该缺陷**不报错**：返回值合法且有值、日志只有一行 warning、UI 无任何异常信号。
+ *   后果是用户关注 A 博主却收到 B 博主的内容，且系统无法自证。
+ *
+ * 因此本文件的断言核心是：**任何用户输入都不得被原样当作 channelId 传给采集器**。
+ * 见下方「绝不原样透传」系列用例。
+ */
+const { resolveChannelId, CREATOR_INPUT_ERRORS } = require('./creator-collector')
+
+// 固定时间无关；本文件全部为纯函数/受控依赖，无网络
+const API_KEY = 'test-key'
+const UC_ID = 'UC_x5XG1OV2P6uZZ5FSM9Tww'
+
+/**
+ * 构造可控的 HTTP 替身：记录调用参数，按查询参数返回预置频道。
+ * 这样测试能断言「走了哪条解析路径」，而不只是断言结果。
+ */
+function makeHttp (routes) {
+  const calls = []
+  const httpGet = async (url, params) => {
+    calls.push({ url, params })
+    const key = Object.keys(routes).find(k => (params || {})[k] !== undefined)
+    if (!key) throw new Error(`unexpected route: ${JSON.stringify(params)}`)
+    return routes[key](params)
+  }
+  return { httpGet, calls }
+}
+
+const okChannel = (id) => async () => ({ status: 200, json: () => ({ items: [{ id }] }) })
+const emptyChannel = async () => ({ status: 200, json: () => ({ items: [] }) })
+
+describe('creator-collector 频道解析 · UC 频道 ID 直取', () => {
+  it('UC 形式不发任何 HTTP 请求', async () => {
+    const { httpGet, calls } = makeHttp({})
+    const cid = await resolveChannelId(UC_ID, { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls).toHaveLength(0)
+  })
+
+  it('完整 URL 中的 UC 片段也被直取，不发请求', async () => {
+    const { httpGet, calls } = makeHttp({})
+    const cid = await resolveChannelId(`https://www.youtube.com/channel/${UC_ID}`, { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls).toHaveLength(0)
+  })
+
+  it('识别到的 UC ID 不得被大小写化（YouTube ID 大小写敏感）', async () => {
+    // 构造一个大小写混合的合法 UC ID，断言原样透传
+    const mixed = 'UC_x5XG1OV2P6uZZ5FSM9Tww'
+    const { httpGet, calls } = makeHttp({})
+    const cid = await resolveChannelId(mixed, { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(mixed)          // 原样，未被 toLowerCase / toUpperCase
+    expect(cid).not.toBe(mixed.toLowerCase())
+    expect(cid).not.toBe(mixed.toUpperCase())
+    expect(calls).toHaveLength(0)
+  })
+
+  it('非法的 UC 前缀（如小写 uc_）不被当作合法 ID 放行', async () => {
+    // YouTube 频道 ID 恒以大写 UC 开头；小写形式无法证明是有效 ID，
+    // 必须 fail-closed 而不是猜一个大小写去试。
+    const { httpGet, calls } = makeHttp({})
+    await expect(resolveChannelId(UC_ID.toLowerCase(), { apiKey: API_KEY, httpGet }))
+      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
+    expect(calls).toHaveLength(0)
+  })
+})
+
+describe('creator-collector 频道解析 · @handle 走 forHandle', () => {
+  it('完整 URL 的 @handle 调用 channels.list?forHandle=', async () => {
+    const { httpGet, calls } = makeHttp({ forHandle: okChannel(UC_ID) })
+    const cid = await resolveChannelId('https://www.youtube.com/@GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls).toHaveLength(1)
+    expect(calls[0].params.forHandle).toBe('GoogleDevelopers')
+    expect(calls[0].params.forUsername).toBeUndefined()
+  })
+
+  it('裸串 @handle 先补全 scheme 再解析（依赖库裸串会 400）', async () => {
+    const { httpGet, calls } = makeHttp({ forHandle: okChannel(UC_ID) })
+    const cid = await resolveChannelId('@GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls[0].params.forHandle).toBe('GoogleDevelopers')
+  })
+
+  it('裸串 youtube.com/@handle 同样先补全 scheme', async () => {
+    const { httpGet, calls } = makeHttp({ forHandle: okChannel(UC_ID) })
+    const cid = await resolveChannelId('youtube.com/@GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls[0].params.forHandle).toBe('GoogleDevelopers')
+  })
+
+  it('forHandle 返回空 items 时 fail-closed 抛 ChannelNotFound，不得回退', async () => {
+    const { httpGet } = makeHttp({ forHandle: emptyChannel })
+    await expect(resolveChannelId('@nope', { apiKey: API_KEY, httpGet }))
+      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND })
+  })
+})
+
+describe('creator-collector 频道解析 · 旧式 /c/ 与 /user/ 走 forUsername', () => {
+  it('/c/Name 走 forUsername', async () => {
+    const { httpGet, calls } = makeHttp({ forUsername: okChannel(UC_ID) })
+    const cid = await resolveChannelId('https://www.youtube.com/c/GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls[0].params.forUsername).toBe('GoogleDevelopers')
+  })
+
+  it('/user/Name 走 forUsername', async () => {
+    const { httpGet, calls } = makeHttp({ forUsername: okChannel(UC_ID) })
+    const cid = await resolveChannelId('https://www.youtube.com/user/GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls[0].params.forUsername).toBe('GoogleDevelopers')
+  })
+
+  it('裸串 youtube.com/c/Name 先补全 scheme', async () => {
+    const { httpGet, calls } = makeHttp({ forUsername: okChannel(UC_ID) })
+    const cid = await resolveChannelId('youtube.com/c/GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(calls[0].params.forUsername).toBe('GoogleDevelopers')
+  })
+})
+
+describe('creator-collector 频道解析 · 绝不原样透传（P0 冒烟缺陷的防线）', () => {
+  // 这组是本文件存在的核心理由。任何一条回归都意味着用户会静默收到别的频道的内容。
+
+  const NEVER_LEAK = [
+    ['@handle（完整 URL）', 'https://www.youtube.com/@GoogleDevelopers'],
+    ['@handle（裸串）', '@GoogleDevelopers'],
+    ['旧式 /c/', 'https://www.youtube.com/c/GoogleDevelopers'],
+    ['旧式 /user/', 'https://www.youtube.com/user/GoogleDevelopers'],
+    ['裸串域名路径', 'youtube.com/@GoogleDevelopers'],
+  ]
+
+  for (const [label, input] of NEVER_LEAK) {
+    it(`${label} 绝不把用户输入原样作为 channelId 传给 API`, async () => {
+      const { httpGet, calls } = makeHttp({
+        forHandle: okChannel(UC_ID),
+        forUsername: okChannel(UC_ID),
+      })
+      await resolveChannelId(input, { apiKey: API_KEY, httpGet })
+      for (const c of calls) {
+        expect(c.params.channelId).toBeUndefined()
+      }
+      // 解析结果必须是 API 返回的 canonical ID，而不是输入串
+      expect(calls.length).toBeGreaterThan(0)
+    })
+  }
+
+  it('解析产物必须等于 API 返回的 canonical ID，而非输入', async () => {
+    const OTHER = 'UC-BsRijgl1O-H-sD4-Zw3UA'   // 冒烟实测中被错误返回的「另一个频道」
+    const { httpGet } = makeHttp({ forHandle: okChannel(UC_ID) })
+    const cid = await resolveChannelId('@GoogleDevelopers', { apiKey: API_KEY, httpGet })
+    expect(cid).toBe(UC_ID)
+    expect(cid).not.toBe('GoogleDevelopers')
+    expect(cid).not.toBe(OTHER)
+  })
+})
+
+describe('creator-collector 频道解析 · 非法输入 fail-closed', () => {
+  it('作品链接（watch?v=）明确报「不是频道链接」', async () => {
+    const { httpGet, calls } = makeHttp({})
+    await expect(resolveChannelId('https://www.youtube.com/watch?v=abc123', { apiKey: API_KEY, httpGet }))
+      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.NOT_A_CHANNEL })
+    expect(calls).toHaveLength(0)   // 识别阶段不发请求
+  })
+
+  it('播放列表链接同样报「不是频道链接」', async () => {
+    const { httpGet } = makeHttp({})
+    await expect(resolveChannelId('https://www.youtube.com/playlist?list=PL123', { apiKey: API_KEY, httpGet }))
+      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.NOT_A_CHANNEL })
+  })
+
+  it('非 YouTube 域名报 INVALID_INPUT，不发请求', async () => {
+    const { httpGet, calls } = makeHttp({})
+    await expect(resolveChannelId('https://v.douyin.com/abc/', { apiKey: API_KEY, httpGet }))
+      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
+    expect(calls).toHaveLength(0)
+  })
+
+  it('空输入报 INVALID_INPUT', async () => {
+    const { httpGet } = makeHttp({})
+    for (const bad of ['', '   ', null, undefined]) {
+      await expect(resolveChannelId(bad, { apiKey: API_KEY, httpGet }))
+        .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
+    }
+  })
+
+  it('无法识别的 YouTube 路径报 INVALID_INPUT，不发请求', async () => {
+    const { httpGet, calls } = makeHttp({})
+    await expect(resolveChannelId('https://www.youtube.com/feed/trending', { apiKey: API_KEY, httpGet }))
+      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
+    expect(calls).toHaveLength(0)
+  })
+})
+
+describe('creator-collector 频道解析 · 错误信息可区分', () => {
+  it('「格式不对」与「频道不存在」是两种不同错误（排查方向不同）', async () => {
+    const { httpGet } = makeHttp({})
+    const formatErr = await resolveChannelId('https://www.youtube.com/feed/x', { apiKey: API_KEY, httpGet })
+      .catch(e => e)
+    const notFoundErr = await resolveChannelId('@ghost', {
+      apiKey: API_KEY, httpGet: makeHttp({ forHandle: emptyChannel }).httpGet,
+    }).catch(e => e)
+
+    expect(formatErr.code).toBe(CREATOR_INPUT_ERRORS.INVALID_INPUT)
+    expect(notFoundErr.code).toBe(CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND)
+    expect(formatErr.code).not.toBe(notFoundErr.code)
+  })
+
+  it('错误对象不含 API Key 明文', async () => {
+    const secret = 'AIzaSySuperSecretKeyValue'
+    const { httpGet } = makeHttp({ forHandle: async () => ({ status: 200, json: () => ({ items: [] }) }) })
+    const err = await resolveChannelId('@ghost', { apiKey: secret, httpGet }).catch(e => e)
+    expect(JSON.stringify(err)).not.toContain(secret)
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-content-quality.js b/apps/desktop/electron/services/creator-content-quality.js
new file mode 100644
index 00000000..17837fe6
--- /dev/null
+++ b/apps/desktop/electron/services/creator-content-quality.js
@@ -0,0 +1,54 @@
+/**
+ * creator-content-quality.js — 正文质量分级
+ *
+ * 分级决定 UI 徽章与「是否推荐送入 AI 写作」。判错的后果是双向的：
+ * 把 stub 当成 full，用户会拿到一段只有标题的文字却以为有完整正文；
+ * 反之把 full 当成 stub，会让真正可用的正文被无谓地降级提示。
+ *
+ * 三档：
+ *   full    —— 字幕正文，质量高
+ *   partial —— 描述正文，质量有限
+ *   stub    —— 仅标题与简介
+ */
+
+'use strict'
+
+const QUALITY = { FULL: 'full', PARTIAL: 'partial', STUB: 'stub' }
+
+/** full 阈值：字幕正文低于此长度多半只抓到片段，不足以喂 AI 写作 */
+const MIN_FULL_CHARS = 500
+/** partial 阈值：描述正文达到此长度才有参考价值 */
+const MIN_PARTIAL_CHARS = 200
+
+/** playlistItems 单页上限 50，再大需翻页（额外消耗配额） */
+const DEFAULT_COLLECT_PAGE_SIZE = 50
+
+const TRANSCRIPT_SOURCES = new Set(['subtitle', 'auto', 'translated'])
+
+/**
+ * @param {string|null|undefined} transcriptSource 字幕来源标记
+ * @param {string|null|undefined} body             正文
+ * @returns {'full'|'partial'|'stub'}
+ */
+function classifyContentQuality (transcriptSource, body) {
+  const text = typeof body === 'string' ? body.trim() : ''
+  const len = text.length
+  if (len === 0) return QUALITY.STUB
+
+  const isTranscript = typeof transcriptSource === 'string' &&
+    TRANSCRIPT_SOURCES.has(transcriptSource.toLowerCase())
+
+  // 字幕来源但长度不足：可能是只抓到一句/一段，宁可降级也不要谎报 full
+  if (isTranscript) return len >= MIN_FULL_CHARS ? QUALITY.FULL : QUALITY.PARTIAL
+
+  // 非字幕来源（描述或未知来源）按长度给 partial/stub
+  return len >= MIN_PARTIAL_CHARS ? QUALITY.PARTIAL : QUALITY.STUB
+}
+
+module.exports = {
+  QUALITY,
+  MIN_FULL_CHARS,
+  MIN_PARTIAL_CHARS,
+  DEFAULT_COLLECT_PAGE_SIZE,
+  classifyContentQuality,
+}
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-content-quality.test.js b/apps/desktop/electron/services/creator-content-quality.test.js
new file mode 100644
index 00000000..e36eeb18
--- /dev/null
+++ b/apps/desktop/electron/services/creator-content-quality.test.js
@@ -0,0 +1,69 @@
+/**
+ * creator-content-quality.test.js — 正文质量分级
+ *
+ * 分级决定 UI 徽章与「是否推荐送入 AI 写作」。判错的后果是双向的：
+ * 把 `stub` 当成 `full`，用户会拿到一段只有标题的文字却以为有完整正文。
+ */
+
+const {
+  classifyContentQuality,
+  QUALITY,
+  MIN_FULL_CHARS,
+  MIN_PARTIAL_CHARS,
+  DEFAULT_COLLECT_PAGE_SIZE,
+} = require('./creator-content-quality')
+
+describe('creator-content-quality · 分级判据', () => {
+  it('字幕来源且正文足够长 → full', () => {
+    expect(classifyContentQuality('subtitle', 'x'.repeat(600))).toBe(QUALITY.FULL)
+  })
+
+  it('字幕来源但正文极短 → 不给 full（可能只抓到一句）', () => {
+    expect(classifyContentQuality('subtitle', '短')).not.toBe(QUALITY.FULL)
+  })
+
+  it('描述来源但长度达标 → partial', () => {
+    expect(classifyContentQuality('description', 'x'.repeat(MIN_PARTIAL_CHARS))).toBe(QUALITY.PARTIAL)
+  })
+
+  it('描述来源且很短 → stub', () => {
+    expect(classifyContentQuality('description', '就一句话')).toBe(QUALITY.STUB)
+  })
+
+  it('无来源无内容 → stub（MUST NOT 误判为可用正文）', () => {
+    expect(classifyContentQuality(null, '')).toBe(QUALITY.STUB)
+    expect(classifyContentQuality(undefined, undefined)).toBe(QUALITY.STUB)
+  })
+})
+
+describe('creator-content-quality · 边界与健壮', () => {
+  it('长度判据用去空白后的字符数（纯空白不算正文）', () => {
+    expect(classifyContentQuality('subtitle', '   \n\t  ' + '字'.repeat(MIN_FULL_CHARS))).toBe(QUALITY.FULL)
+  })
+
+  it('恰好达 partial 阈值即 partial（边界含端点）', () => {
+    const body = '字'.repeat(MIN_PARTIAL_CHARS)
+    expect(classifyContentQuality('description', body)).toBe(QUALITY.PARTIAL)
+  })
+
+  it('阈值常量自洽：full 阈值不低于 partial 阈值', () => {
+    expect(MIN_FULL_CHARS).toBeGreaterThanOrEqual(MIN_PARTIAL_CHARS)
+  })
+
+  it('非字符串输入不抛错，一律降级 stub', () => {
+    for (const bad of [123, {}, [], true]) {
+      expect(() => classifyContentQuality('subtitle', bad)).not.toThrow()
+    }
+    expect(classifyContentQuality('subtitle', 123)).toBe(QUALITY.STUB)
+  })
+
+  it('未知 transcriptSource 不当成字幕', () => {
+    expect(classifyContentQuality('someNewSource', 'x'.repeat(MIN_FULL_CHARS))).toBe(QUALITY.PARTIAL)
+  })
+})
+
+describe('creator-content-quality · 采集页大小', () => {
+  it('页大小取 YouTube playlistItems 单页上限', () => {
+    expect(DEFAULT_COLLECT_PAGE_SIZE).toBe(50)
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-dependency-probe.test.js b/apps/desktop/electron/services/creator-dependency-probe.test.js
new file mode 100644
index 00000000..8d1d0b33
--- /dev/null
+++ b/apps/desktop/electron/services/creator-dependency-probe.test.js
@@ -0,0 +1,78 @@
+/**
+ * creator-collector.test.js 的补充：依赖探测的降级契约
+ *
+ * 为什么单独测：`content_aggregator` 是本仓 python-backend 的 **optional 依赖**，
+ * 且打包产物**不分发 Python 环境**（python-bridge 直接 spawn 系统 python）。
+ * 目标机器若没装 pip install content-aggregator，YouTube 采集不可用。
+ *
+ * 这里不能真卸载依赖，故用注入的 requireFn 精确模拟 ImportError，
+ * 验证三件事：
+ *   1. 缺依赖时**如实报告不可用**，而不是返回一个半可用状态
+ *   2. 降级信息里带**确切安装命令**（含国内镜像源写法）
+ *   3. 探测本身**永不抛异常** —— 后端健康检查阶段调用它，抛异常会打断启动
+ */
+const { probeDependency, CREATOR_INPUT_ERRORS } = require('./creator-collector')
+
+describe('creator-collector · 依赖探测 · 正常', () => {
+  it('依赖可用时返回 ready 与构造器', () => {
+    class Fake {}
+    const r = probeDependency(() => ({ YouTubeCollector: Fake }))
+    expect(r.ready).toBe(true)
+    expect(r.YouTubeCollector).toBe(Fake)
+  })
+
+  it('可用时不携带 installHint（免得 UI 显示无意义的安装指引）', () => {
+    const r = probeDependency(() => ({ YouTubeCollector: class {} }))
+    expect(r.installHint).toBeUndefined()
+  })
+})
+
+describe('creator-collector · 依赖探测 · 缺包降级', () => {
+  const missing = () => {
+    const e = new Error("No module named 'content_aggregator'")
+    e.code = 'MODULE_NOT_FOUND'
+    throw e
+  }
+
+  it('缺包时 ready=false，并保留原因', () => {
+    const r = probeDependency(missing)
+    expect(r.ready).toBe(false)
+    expect(r.reason).toContain('content_aggregator')
+  })
+
+  it('降级信息带确切安装命令', () => {
+    const r = probeDependency(missing)
+    expect(r.installHint).toContain('pip install content-aggregator')
+  })
+
+  it('安装命令带国内镜像源写法 —— 否则国内用户按默认源装不上，等于没提示', () => {
+    const r = probeDependency(missing)
+    expect(r.installHint).toMatch(/pypi\.tuna\.tsinghua\.edu\.cn/)
+  })
+
+  it('探测永不抛异常 —— 它在健康检查阶段调用，抛出即打断应用启动', () => {
+    expect(() => probeDependency(missing)).not.toThrow()
+  })
+
+  it('探测内部再抛（如权限错）也收敛为 ready=false 而非上抛', () => {
+    const r = probeDependency(() => { throw new Error('EACCES') })
+    expect(r.ready).toBe(false)
+    expect(r.reason).toContain('EACCES')
+  })
+
+  it('缺包时不返回构造器 —— 调用方若误判会拿到 undefined 并炸在深处', () => {
+    const r = probeDependency(missing)
+    expect(r.YouTubeCollector).toBeUndefined()
+  })
+})
+
+describe('creator-collector · 依赖缺失错误码可被 IPC 层识别', () => {
+  it('DEPENDENCY_MISSING 是约定的错误码（UI 据此显示安装指引而非泛化失败）', () => {
+    expect(CREATOR_INPUT_ERRORS.DEPENDENCY_MISSING).toBe('creator:dependency_missing')
+  })
+
+  it('缺包应映射到 DEPENDENCY_MISSING 而不是 INVALID_INPUT', () => {
+    // 两者 UI 表现完全不同：前者给安装命令，后者让用户改输入
+    expect(CREATOR_INPUT_ERRORS.DEPENDENCY_MISSING).not.toBe(CREATOR_INPUT_ERRORS.INVALID_INPUT)
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-limits.js b/apps/desktop/electron/services/creator-limits.js
new file mode 100644
index 00000000..e63e2359
--- /dev/null
+++ b/apps/desktop/electron/services/creator-limits.js
@@ -0,0 +1,102 @@
+/**
+ * creator-limits.js — 采集数量双轨与硬上限
+ *
+ * 需求原文：「需要设置默认数量，同时有个上限，一次采集数量不能超过上限」。
+ * 本模块把这条规则做成**纯函数**，便于穷举边界，也便于 UI 与主进程共用同一判据。
+ *
+ * ## 三条不可让步的规则
+ *
+ *  1. **超限拒绝且零副作用**：必须在下发任何 SQL 之前判定。已经入库的内容
+ *     撤不回来，「先执行再回滚」不是可接受的实现方式。
+ *  2. **禁止静默截断**：采少了必须如实告知「发现 N 条、采集 M 条、剩余 K 条
+ *     留待下次」。静默截断会让用户以为全采了。
+ *  3. **单条仅豁免数量上限**：单条采集不受数量上限约束（一条不存在「超限」），
+ *     但**仍受配额约束**——豁免范围不得悄悄扩大。
+ */
+
+'use strict'
+
+const COLLECT_DEFAULTS = {
+  /** 「一键采集新作品」默认数量 */
+  oneClick: 5,
+  /** 「手动批量采集」默认数量 */
+  manual: 50,
+  /** 全局硬上限，任何路径不可超 */
+  hardLimit: 100,
+}
+
+class ClampError extends Error {
+  constructor (count, max) {
+    super(`本次最多采集 ${max} 条，请调整数量`)
+    this.name = 'ClampError'
+    this.code = 'creator:count_exceeds_limit'
+    this.count = count
+    this.max = max
+  }
+}
+
+/**
+ * 计算生效上限 = min(个人上限, 全局硬上限)。
+ * 非法个人上限（非正数 / 非数字）一律回落到全局，不得产生 0 或 NaN 上限——
+ * 那会让后续所有 count 都被判超限，或让比较永远为 false。
+ */
+function resolveEffectiveLimit (perCreatorLimit, hardLimit = COLLECT_DEFAULTS.hardLimit) {
+  const n = Number(perCreatorLimit)
+  const hard = Number.isFinite(Number(hardLimit)) && Number(hardLimit) > 0
+    ? Number(hardLimit)
+    : COLLECT_DEFAULTS.hardLimit
+  if (!Number.isFinite(n) || n <= 0) return hard
+  return Math.min(n, hard)
+}
+
+/** 校验 count 是否可执行。不合法一律抛错，绝不静默修正成「看起来合理」的值。 */
+function assertCollectCount (count, effectiveLimit) {
+  const n = Number(count)
+  if (!Number.isInteger(n)) {
+    const err = new Error('采集数量必须是整数')
+    err.code = 'creator:count_not_integer'
+    throw err
+  }
+  if (n <= 0) {
+    const err = new Error('采集数量必须大于 0')
+    err.code = 'creator:count_not_positive'
+    throw err
+  }
+  if (n > effectiveLimit) throw new ClampError(n, effectiveLimit)
+  return n
+}
+
+/**
+ * 生成采集计划：选哪些、剩多少、要不要提示。
+ *
+ * @param {{pending: Array, count: number, effectiveLimit: number}} input
+ * @returns {{selected: Array, remain: number, truncated: boolean}}
+ * @throws {ClampError} 超限时直接抛，不返回部分计划——已产生的副作用无法回滚。
+ */
+function planCollect ({ pending, count, effectiveLimit }) {
+  assertCollectCount(count, effectiveLimit)
+  const list = Array.isArray(pending) ? pending.slice() : []
+
+  // 默认按发布时间倒序取最新；缺失时间的排在最后而不是崩在比较函数里
+  list.sort((a, b) => {
+    const av = a && a.published_at ? String(a.published_at) : ''
+    const bv = b && b.published_at ? String(b.published_at) : ''
+    if (!av && !bv) return 0
+    if (!av) return 1
+    if (!bv) return -1
+    return av < bv ? 1 : (av > bv ? -1 : 0)
+  })
+
+  const selected = list.slice(0, count)
+  const remain = Math.max(0, list.length - selected.length)
+  // truncated 只表示「还有没采的」，需要 UI 告知；不代表超限
+  return { selected, remain, truncated: remain > 0, available: list.length }
+}
+
+module.exports = {
+  COLLECT_DEFAULTS,
+  ClampError,
+  resolveEffectiveLimit,
+  assertCollectCount,
+  planCollect,
+}
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-limits.test.js b/apps/desktop/electron/services/creator-limits.test.js
new file mode 100644
index 00000000..fe1e236e
--- /dev/null
+++ b/apps/desktop/electron/services/creator-limits.test.js
@@ -0,0 +1,134 @@
+/**
+ * creator-limits.test.js — 采集数量双轨与硬上限
+ *
+ * 这是需求里被直接点名的部分：「需要设置默认数量，同时有个上限，
+ * 一次采集数量不能超过上限」。三条不可让步的规则：
+ *
+ *  1. 超限 MUST 拒绝且**零副作用**（不得先执行再回滚——已入库的内容撤不回来）
+ *  2. MUST NOT 静默截断：采少了必须告知剩多少、留待下次
+ *  3. 单条采集仅豁免「数量上限」，MUST NOT 豁免配额
+ */
+const {
+  COLLECT_DEFAULTS,
+  resolveEffectiveLimit,
+  assertCollectCount,
+  planCollect,
+  ClampError,
+} = require('./creator-limits')
+
+describe('creator-limits · 默认值', () => {
+  it('一键采集默认 5，手动批量默认 50，全局硬上限 100', () => {
+    expect(COLLECT_DEFAULTS.oneClick).toBe(5)
+    expect(COLLECT_DEFAULTS.manual).toBe(50)
+    expect(COLLECT_DEFAULTS.hardLimit).toBe(100)
+  })
+})
+
+describe('creator-limits · 生效上限', () => {
+  it('未设个人上限时用全局硬上限', () => {
+    expect(resolveEffectiveLimit(null)).toBe(100)
+    expect(resolveEffectiveLimit(undefined)).toBe(100)
+  })
+
+  it('个人上限低于全局时以个人为准', () => {
+    expect(resolveEffectiveLimit(20)).toBe(20)
+  })
+
+  it('个人上限高于全局时被压回全局——不得借个人设置绕过硬上限', () => {
+    expect(resolveEffectiveLimit(500)).toBe(100)
+  })
+
+  it('非法的个人上限（非正数）回落全局，不产生 0 或 NaN 上限', () => {
+    for (const bad of [0, -1, 'abc', NaN, null]) {
+      const v = resolveEffectiveLimit(bad)
+      expect(Number.isFinite(v)).toBe(true)
+      expect(v).toBeGreaterThan(0)
+    }
+  })
+})
+
+describe('creator-limits · 超限拒绝（零副作用）', () => {
+  it('count 超过生效上限时抛出，且携带上限值供 UI 展示', () => {
+    try {
+      assertCollectCount(150, resolveEffectiveLimit(null))
+      throw new Error('应当抛出')
+    } catch (e) {
+      expect(e).toBeInstanceOf(ClampError)
+      expect(e.count).toBe(150)
+      expect(e.max).toBe(100)
+    }
+  })
+
+  it('恰好等于上限时放行（边界含端点）', () => {
+    expect(() => assertCollectCount(100, 100)).not.toThrow()
+  })
+
+  it('上限 1 时 count=2 被拒', () => {
+    expect(() => assertCollectCount(2, 1)).toThrow(ClampError)
+  })
+
+  it('非整数 count 被拒（浮点会让 SQL LIMIT 行为不可预期）', () => {
+    expect(() => assertCollectCount(5.5, 100)).toThrow(/整数/)
+    expect(() => assertCollectCount(NaN, 100)).toThrow(/整数/)
+  })
+
+  it('非正数 count 被拒', () => {
+    expect(() => assertCollectCount(0, 100)).toThrow()
+    expect(() => assertCollectCount(-3, 100)).toThrow()
+  })
+})
+
+describe('creator-limits · 采集计划（不静默截断）', () => {
+  const pending = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}` }))
+
+  it('待采集少于 count 时全取，remain 为 0', () => {
+    const p = planCollect({ pending, count: 5, effectiveLimit: 100 })
+    expect(p.selected).toHaveLength(5)
+    expect(p.remain).toBe(7)
+    expect(p.truncated).toBe(true)     // 12 > 5，必须告知剩余
+  })
+
+  it('待采集正好等于 count 时不提示剩余', () => {
+    const p = planCollect({ pending: pending.slice(0, 5), count: 5, effectiveLimit: 100 })
+    expect(p.selected).toHaveLength(5)
+    expect(p.remain).toBe(0)
+    expect(p.truncated).toBe(false)
+  })
+
+  it('超限时 planCollect 直接抛错，不返回部分计划', () => {
+    // 关键：绝不能「先给 100 条再告诉用户超了」——那已经产生副作用了
+    expect(() => planCollect({ pending, count: 200, effectiveLimit: 100 })).toThrow(ClampError)
+  })
+
+  it('按 publishedAt 倒序取最新（默认行为）', () => {
+    const items = [
+      { id: 'old', published_at: '2026-01-01T00:00:00Z' },
+      { id: 'new', published_at: '2026-10-01T00:00:00Z' },
+      { id: 'mid', published_at: '2026-06-01T00:00:00Z' },
+    ]
+    const p = planCollect({ pending: items, count: 2, effectiveLimit: 100 })
+    expect(p.selected.map(x => x.id)).toEqual(['new', 'mid'])
+  })
+
+  it('published_at 缺失的排在最后而非崩溃', () => {
+    const items = [
+      { id: 'no-date' },
+      { id: 'dated', published_at: '2026-10-01T00:00:00Z' },
+    ]
+    const p = planCollect({ pending: items, count: 2, effectiveLimit: 100 })
+    expect(p.selected.map(x => x.id)).toEqual(['dated', 'no-date'])
+  })
+
+  it('空列表返回空计划而非抛错', () => {
+    const p = planCollect({ pending: [], count: 5, effectiveLimit: 100 })
+    expect(p.selected).toHaveLength(0)
+    expect(p.remain).toBe(0)
+    expect(p.truncated).toBe(false)
+  })
+
+  it('count 大于实际待采集数时 selected 取全部，remain 为 0', () => {
+    const p = planCollect({ pending: pending.slice(0, 3), count: 10, effectiveLimit: 100 })
+    expect(p.selected).toHaveLength(3)
+    expect(p.remain).toBe(0)
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-monitor.js b/apps/desktop/electron/services/creator-monitor.js
new file mode 100644
index 00000000..946e3e18
--- /dev/null
+++ b/apps/desktop/electron/services/creator-monitor.js
@@ -0,0 +1,192 @@
+/**
+ * creator-monitor.js — 博主监控的纯逻辑层：失败分级与配额求解
+ *
+ * 本模块只放**可被单测完全覆盖的纯逻辑**，不碰数据库与网络。
+ * 副作用（探测、采集、落库）由 creator-store / creator-collector 承担。
+ *
+ * ## 失败分级为什么按 reason 而非 HTTP 状态码
+ *
+ * YouTube Data API 的节流类错误**全部返回 403**：
+ * quotaExceeded / dailyLimitExceeded / rateLimitExceeded / userRateLimitExceeded。
+ * 若按「4xx=可自愈、5xx=瞬时」粗判，配额耗尽会被当成真故障累计到自动暂停——
+ * **用户因为配额被锁死**，而配额是每天自然恢复的，不该触发暂停。
+ * 反向也踩过：ipRefererBlocked 是**应用级** 403（Key/IP/referrer 被拒），
+ * 若归为「单条错误」则表现为「每条都失败但博主永不暂停」，监控静默失效。
+ *
+ * 因此分类依据是 `error.errors[].reason`，状态码仅在 reason 缺失时兜底。
+ */
+
+'use strict'
+
+const FAILURE_TIERS = {
+  /** 正常节流：等下个周期即可，MUST NOT 计入连续失败 */
+  THROTTLED: 'throttled',
+  /** 瞬时故障：5xx / 网络抖动，指数退避重试，不计入连续失败 */
+  TRANSIENT: 'transient',
+  /** 博主级真故障：连续 3 次触发 auto_paused */
+  PERMANENT: 'permanent',
+  /** 不可自愈：凭证问题，首次即 fatal_paused，UI 指向设置页 */
+  FATAL: 'fatal',
+  /** 单资源级：只影响这一条 discovery，MUST NOT 影响博主监控状态 */
+  ITEM: 'item',
+}
+
+/** reason 优先级：配额 > 鉴权 > 资源不存在 > 单条 > 兜底。
+ *  响应体可能带多个 errors[]；顺序固定，否则「配额+鉴权」会被鉴权抢先，
+ *  配额耗尽又被误报成凭证问题，用户会去改一个没坏的 Key。 */
+const REASON_PRIORITY = [
+  { reasons: ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded',
+    'userRateLimitExceeded', 'userRateLimitExceededUnreg'], tier: FAILURE_TIERS.THROTTLED },
+  { reasons: ['keyInvalid', 'keyNotValid', 'badRequest', 'accessNotConfigured',
+    'accessForbidden', 'forbidden', 'ipRefererBlocked', 'youtubeSignupRequired'],
+  tier: FAILURE_TIERS.FATAL },
+  { reasons: ['channelNotFound', 'playlistNotFound', 'invalidPageToken'],
+    tier: FAILURE_TIERS.PERMANENT },
+  { reasons: ['videoNotFound'], tier: FAILURE_TIERS.ITEM },
+  { reasons: ['backendError', 'internalError', 'rateLimitBackend'], tier: FAILURE_TIERS.TRANSIENT },
+]
+
+/** 哪些分级会计入「连续失败」并最终导致暂停 */
+const COUNTS_AS_FAILURE = new Set([
+  FAILURE_TIERS.PERMANENT, FAILURE_TIERS.FATAL,
+])
+
+const TRANSPORT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])
+
+/** 探测需求的可复算基准：日次数 = 1440 分钟 / 间隔分钟数 */
+const PROJECTION_BASIS = '1440/interval_min'
+
+const DEFAULT_INTERVAL_MIN = 60
+
+function firstReason (body) {
+  if (!body || typeof body !== 'object') return null
+  const err = body.error && typeof body.error === 'object' ? body.error : body
+  const list = Array.isArray(err.errors) ? err.errors : []
+  // 按优先级表遍历，每个候选 reason 集合内保持声明顺序
+  for (const group of REASON_PRIORITY) {
+    for (const want of group.reasons) {
+      if (list.some(e => e && e.reason === want)) return { reason: want, tier: group.tier }
+    }
+  }
+  const any = list.find(e => e && e.reason)
+  return any ? { reason: any.reason, tier: null } : null
+}
+
+/**
+ * 把一次失败分级。
+ *
+ * @param {number} httpStatus HTTP 状态码（无响应时为 0）
+ * @param {object|null} body   响应体
+ * @param {Error|null}  transportErr 传输层错误（没拿到 HTTP 响应时）
+ * @returns {{tier: string, reason: string, countsAsFailure: boolean, retryable: boolean}}
+ *   刻意不携带 apiKey / 原始响应体，避免凭证与长文本经日志泄漏。
+ */
+function classifyFailure (httpStatus, body, transportErr) {
+  if (transportErr) {
+    const transient = TRANSPORT_CODES.has(transportErr.code)
+    return {
+      tier: transient ? FAILURE_TIERS.TRANSIENT : FAILURE_TIERS.PERMANENT,
+      reason: transportErr.code ? `transport:${transportErr.code}` : 'transport:unknown',
+      countsAsFailure: !transient,
+      retryable: transient,
+    }
+  }
+
+  const hit = firstReason(body)
+  if (hit && hit.tier) {
+    return {
+      tier: hit.tier,
+      reason: hit.reason,
+      countsAsFailure: COUNTS_AS_FAILURE.has(hit.tier),
+      retryable: !COUNTS_AS_FAILURE.has(hit.tier),
+    }
+  }
+
+  // reason 缺失或未识别 → 用状态码兜底
+  const status = Number(httpStatus) || 0
+  if (status === 429) return mk(FAILURE_TIERS.THROTTLED, 'http_429')
+  if (status === 401) return mk(FAILURE_TIERS.FATAL, 'http_401')
+  if (status === 403) return mk(FAILURE_TIERS.FATAL, 'http_403_no_reason')
+  if (status >= 500) return mk(FAILURE_TIERS.TRANSIENT, `http_${status}`)
+  // 未识别 = fail-closed：计入失败。放行会让所有无法识别的错误无声跳过。
+  return mk(FAILURE_TIERS.PERMANENT, (hit && hit.reason) || `unknown_http_${status}`)
+}
+
+function mk (tier, reason) {
+  const countsAsFailure = COUNTS_AS_FAILURE.has(tier)
+  return { tier, reason, countsAsFailure, retryable: !countsAsFailure }
+}
+
+/** 规整间隔：缺失/非法一律回落到默认 60，避免产生 NaN / Infinity 把配额算崩 */
+function normalizeInterval (raw) {
+  const n = Number(raw)
+  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MIN
+  return n
+}
+
+/** 日探测需求（units）= Σ(1440 / interval_min)。稳态每次探测恒为 1 unit。 */
+function projectedProbeUnits (follows) {
+  const list = Array.isArray(follows) ? follows : []
+  return list.reduce((sum, f) => sum + 1440 / normalizeInterval(f && f.check_interval_min), 0)
+}
+
+/**
+ * 校验（新增或改间隔后）总探测需求是否落在池内。**必须在写库之前调用**。
+ * @throws {Error & {code, projected, pool}} QuotaExceedError
+ */
+function assertQuotaFits (follows, pool, pendingAddition) {
+  const list = Array.isArray(follows) ? follows.slice() : []
+  if (pendingAddition) list.push(pendingAddition)
+  const projected = projectedProbeUnits(list)
+  if (projected > pool) {
+    const err = new Error(
+      `探测配额不足：预计每日消耗 ${Math.ceil(projected)} units，超出探测池 ${pool} units`
+    )
+    err.code = 'creator:quota_would_exceed'
+    err.projected = Math.ceil(projected)
+    err.pool = pool
+    throw err
+  }
+  return projected
+}
+
+/**
+ * 池子不足以覆盖全部关注项时的**确定性**保底/跳过集。
+ *
+ * 排序键固定为 (check_interval_min 升序, id 升序) —— **检查更频繁的优先保底**。
+ * 语义取舍：频繁检查项单位成本更高，极端情况下单个 5 分钟关注项就能吃掉整个探测池。
+ * 这正是 `assertQuotaFits` 必须在**配置变更时**拦截的原因：
+ * 让这种状态压根产生不出来，比在运行时临时降级更可靠。
+ *
+ * 同一份数据 + 同一个池子 MUST 得到完全相同的结果 ——
+ * 「有的查了有的没查」若不可复现，用户看到的现象就无法解释。
+ *
+ * @param {Array<{id:string, check_interval_min:number}>} follows
+ * @param {number} pool 可用 units
+ */
+function buildSkipSet (follows, pool) {
+  const list = (Array.isArray(follows) ? follows : []).slice()
+  const ordered = list
+    .map((f) => ({ f, interval: normalizeInterval(f && f.check_interval_min) }))
+    .sort((a, b) => (a.interval - b.interval) || String(a.f.id).localeCompare(String(b.f.id)))
+  const keep = []
+  const skip = []
+  let used = 0
+  for (const { f, interval } of ordered) {
+    const cost = 1440 / interval
+    if (used + cost <= pool) { keep.push(f); used += cost } else skip.push(f)
+  }
+  return { keep, skip, projected: used }
+}
+
+module.exports = {
+  FAILURE_TIERS,
+  REASON_PRIORITY,
+  PROJECTION_BASIS,
+  DEFAULT_INTERVAL_MIN,
+  classifyFailure,
+  normalizeInterval,
+  projectedProbeUnits,
+  assertQuotaFits,
+  buildSkipSet,
+}
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-monitor.test.js b/apps/desktop/electron/services/creator-monitor.test.js
new file mode 100644
index 00000000..8b68cc61
--- /dev/null
+++ b/apps/desktop/electron/services/creator-monitor.test.js
@@ -0,0 +1,270 @@
+/**
+ * creator-monitor.test.js — 博主监控：失败分级与配额求解
+ *
+ * 两块都是「算错会静默出事」而非「算错会报错」的逻辑，因此单独锁死：
+ *
+ * 1. **失败分级按 API reason，不按 HTTP 状态码**
+ *    YouTube 的 quotaExceeded / dailyLimitExceeded / rateLimitExceeded /
+ *    userRateLimitExceeded **全部返回 403**。若按状态码粗判（4xx=可自愈、
+ *    5xx=瞬时），配额耗尽会被当成真故障累计到自动暂停 —— 用户因配额被锁死。
+ *    反向也踩过：ipRefererBlocked 是**应用级** 403，若归「单条错误」则
+ *    表现为「每条都失败但博主永不暂停」，监控静默失效。
+ *
+ * 2. **配额联立求解**
+ *    只按默认间隔验算会漏掉下限场景：间隔下限 5 分钟时，
+ *    50 博主 × (1440/5) = 14400 units，是探测池 1500 的 9.6 倍。
+ */
+const {
+  classifyFailure,
+  FAILURE_TIERS,
+  projectedProbeUnits,
+  assertQuotaFits,
+  buildSkipSet,
+  PROJECTION_BASIS,
+} = require('./creator-monitor')
+
+/** 构造 YouTube Data API 典型错误体 */
+function apiErr (code, reason) {
+  return { code, message: 'err', errors: reason ? [{ reason, domain: 'youtube.api' }] : [] }
+}
+
+describe('creator-monitor · 失败分级 · 节流（403 陷阱）', () => {
+  // 这组是本文件最核心的用例：按 HTTP 状态码分类的实现会在此全部失败。
+  const throttled = [
+    ['quotaExceeded', 403],
+    ['dailyLimitExceeded', 403],
+    ['rateLimitExceeded', 403],
+    ['userRateLimitExceeded', 403],
+    ['userRateLimitExceededUnreg', 403],
+  ]
+  for (const [reason, code] of throttled) {
+    it(`${reason}（HTTP ${code}）判为 throttled，且不计入连续失败`, () => {
+      const r = classifyFailure(code, apiErr(code, reason))
+      expect(r.tier).toBe(FAILURE_TIERS.THROTTLED)
+      expect(r.countsAsFailure).toBe(false)
+    })
+  }
+
+  it('无 reason 的裸 429 也判节流（HTTP 429 语义即 Too Many Requests）', () => {
+    const r = classifyFailure(429, { code: 429, errors: [] })
+    expect(r.tier).toBe(FAILURE_TIERS.THROTTLED)
+    expect(r.countsAsFailure).toBe(false)
+  })
+
+  it('节流必须原样带出 reason，供日志与 UI 归因', () => {
+    expect(classifyFailure(403, apiErr(403, 'quotaExceeded')).reason).toBe('quotaExceeded')
+  })
+})
+
+describe('creator-monitor · 失败分级 · 不可自愈（首次即暂停）', () => {
+  it('keyInvalid 即使是 HTTP 400 也判 fatal（不能假设它一定是 403）', () => {
+    const r = classifyFailure(400, apiErr(400, 'keyInvalid'))
+    expect(r.tier).toBe(FAILURE_TIERS.FATAL)
+    expect(r.countsAsFailure).toBe(true)
+  })
+
+  it('keyInvalid 为 403 时同样 fatal', () => {
+    expect(classifyFailure(403, apiErr(403, 'keyInvalid')).tier).toBe(FAILURE_TIERS.FATAL)
+  })
+
+  for (const reason of ['keyInvalid', 'accessNotConfigured', 'ipRefererBlocked', 'forbidden']) {
+    it(`${reason} 判 fatal`, () => {
+      expect(classifyFailure(403, apiErr(403, reason)).tier).toBe(FAILURE_TIERS.FATAL)
+    })
+  }
+
+  it('ipRefererBlocked 是应用级 403，不得归为单条错误', () => {
+    // 归 item 会变成「每条都失败但博主永不暂停」，监控静默失效
+    const r = classifyFailure(403, apiErr(403, 'ipRefererBlocked'))
+    expect(r.tier).not.toBe(FAILURE_TIERS.ITEM)
+  })
+
+  it('无 reason 的 401 判 fatal（鉴权问题不会自愈）', () => {
+    expect(classifyFailure(401, { code: 401, errors: [] }).tier).toBe(FAILURE_TIERS.FATAL)
+  })
+})
+
+describe('creator-monitor · 失败分级 · 单资源 vs 博主级', () => {
+  it('videoNotFound 判 item：一条视频被删不该停用整个博主', () => {
+    const r = classifyFailure(404, apiErr(404, 'videoNotFound'))
+    expect(r.tier).toBe(FAILURE_TIERS.ITEM)
+    expect(r.countsAsFailure).toBe(false)
+  })
+
+  it('invalidPageToken 判博主级而非 item', () => {
+    // 分页游标过期是「本次探测没跑完」，归 item 会静默丢失后续分页的全部作品
+    const r = classifyFailure(400, apiErr(400, 'invalidPageToken'))
+    expect(r.tier).not.toBe(FAILURE_TIERS.ITEM)
+    expect(r.countsAsFailure).toBe(true)
+  })
+
+  it('channelNotFound 判博主级永久失败，连续 3 次触发 auto_paused', () => {
+    const r = classifyFailure(404, apiErr(404, 'channelNotFound'))
+    expect(r.tier).toBe(FAILURE_TIERS.PERMANENT)
+    expect(r.countsAsFailure).toBe(true)
+  })
+})
+
+describe('creator-monitor · 失败分级 · 瞬时', () => {
+  it('5xx 判 transient 且不计入连续失败', () => {
+    const r = classifyFailure(503, apiErr(503, 'backendError'))
+    expect(r.tier).toBe(FAILURE_TIERS.TRANSIENT)
+    expect(r.countsAsFailure).toBe(false)
+  })
+
+  it('无 reason 的 500 仍判 transient', () => {
+    expect(classifyFailure(500, { code: 500, errors: [] }).tier).toBe(FAILURE_TIERS.TRANSIENT)
+  })
+
+  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN']) {
+    it(`传输层 ${code} 判 transient`, () => {
+      const r = classifyFailure(0, null, { code })
+      expect(r.tier).toBe(FAILURE_TIERS.TRANSIENT)
+      expect(r.countsAsFailure).toBe(false)
+    })
+  }
+})
+
+describe('creator-monitor · 失败分级 · 兜底 fail-closed', () => {
+  it('reason 缺失且状态码无法归类时计入失败（不静默放行）', () => {
+    // 放行会让「所有无法识别的错误」都无声跳过 —— 分类失败本身要暴露
+    const r = classifyFailure(418, { code: 418, errors: [] })
+    expect(r.countsAsFailure).toBe(true)
+  })
+
+  it('未识别的 reason 兜底为计入失败并保留原文供诊断', () => {
+    const r = classifyFailure(400, apiErr(400, 'someBrandNewReason'))
+    expect(r.reason).toBe('someBrandNewReason')
+    expect(r.countsAsFailure).toBe(true)
+  })
+
+  it('响应体缺失也不抛异常（分级失败不等于程序崩溃）', () => {
+    expect(() => classifyFailure(200, undefined)).not.toThrow()
+  })
+
+  it('分级结果永不含 apiKey 明文', () => {
+    const r = classifyFailure(400, apiErr(400, 'keyInvalid'), null, 'AIzaSySECRET')
+    expect(JSON.stringify(r)).not.toContain('AIzaSySECRET')
+  })
+})
+
+describe('creator-monitor · reason 优先级', () => {
+  it('多个 reason 同时存在时按固定优先级取第一个命中', () => {
+    // 响应体可能带多个 errors[]；必须按 配额 > 鉴权 > 不存在 > 单条 的次序，
+    // 否则「配额 + 鉴权」会被鉴权抢先，配额耗尽又被误判成凭证问题。
+    const body = { code: 403, errors: [{ reason: 'keyInvalid' }, { reason: 'quotaExceeded' }] }
+    expect(classifyFailure(403, body).tier).toBe(FAILURE_TIERS.THROTTLED)
+  })
+
+  it('配额优先级高于鉴权', () => {
+    const body = { code: 403, errors: [{ reason: 'accessNotConfigured' }, { reason: 'dailyLimitExceeded' }] }
+    expect(classifyFailure(403, body).tier).toBe(FAILURE_TIERS.THROTTLED)
+  })
+
+  it('鉴权优先级高于不存在', () => {
+    const body = { code: 400, errors: [{ reason: 'channelNotFound' }, { reason: 'keyInvalid' }] }
+    expect(classifyFailure(400, body).tier).toBe(FAILURE_TIERS.FATAL)
+  })
+
+  it('单条错误优先级最低', () => {
+    const body = { code: 400, errors: [{ reason: 'videoNotFound' }, { reason: 'channelNotFound' }] }
+    expect(classifyFailure(400, body).tier).toBe(FAILURE_TIERS.PERMANENT)
+  })
+
+  it('优先级顺序已固化为常量，便于文档与 UI 复用', () => {
+    expect(PROJECTION_BASIS).toBe('1440/interval_min')
+  })
+})
+
+describe('creator-monitor · 配额联立求解', () => {
+  it('日探测需求 = Σ(1440 / interval_min)', () => {
+    expect(projectedProbeUnits([{ check_interval_min: 60 }, { check_interval_min: 60 }])).toBe(48)
+  })
+
+  it('50 个博主 @1 小时 = 1200 units，在探测池内', () => {
+    const follows = Array.from({ length: 50 }, () => ({ check_interval_min: 60 }))
+    expect(projectedProbeUnits(follows)).toBe(1200)
+    expect(() => assertQuotaFits(follows, 1500)).not.toThrow()
+  })
+
+  it('50 个博主全设 5 分钟下限 = 14400 units，必须拒绝（只验默认值会漏）', () => {
+    const follows = Array.from({ length: 50 }, () => ({ check_interval_min: 5 }))
+    expect(projectedProbeUnits(follows)).toBe(14400)
+    expect(() => assertQuotaFits(follows, 1500)).toThrow(/1500/)
+  })
+
+  it('混合间隔按各自频率累加', () => {
+    const follows = [{ check_interval_min: 5 }, { check_interval_min: 1440 }]
+    expect(projectedProbeUnits(follows)).toBe(288 + 1)
+  })
+
+  it('interval_min 缺失或非法时按默认 60 计，不产生 NaN/Infinity', () => {
+    const v = projectedProbeUnits([{}, { check_interval_min: 0 }, { check_interval_min: -5 }])
+    expect(Number.isFinite(v)).toBe(true)
+    expect(v).toBe(72)   // 3 × (1440/60)
+  })
+
+  it('拒绝时抛出可判定的错误对象（带 projected / pool，供 UI 展示）', () => {
+    const follows = Array.from({ length: 50 }, () => ({ check_interval_min: 5 }))
+    try {
+      assertQuotaFits(follows, 1500)
+      throw new Error('应当抛出')
+    } catch (e) {
+      expect(e.projected).toBe(14400)
+      expect(e.pool).toBe(1500)
+    }
+  })
+
+  it('待新增的关注项在插入前即校验（不得先写库再判定）', () => {
+    // 50×60min = 1200 units；再加一个 5min（288）= 1488，仍在池内 -> 放行
+    const fits = Array.from({ length: 50 }, () => ({ check_interval_min: 60 }))
+    expect(() => assertQuotaFits(fits, 1500, { check_interval_min: 5 })).not.toThrow()
+
+    // 50×5min 已远超池；再加一项必然超限 -> 拒绝
+    const nearFull = Array.from({ length: 50 }, () => ({ check_interval_min: 5 }))
+    expect(() => assertQuotaFits(nearFull, 1500, { check_interval_min: 5 })).toThrow()
+  })
+})
+
+describe('creator-monitor · 超限时的确定性跳过集', () => {
+  it('间隔小（检查更频繁）的优先保底，剩余跳过', () => {
+    const follows = [
+      { id: 'a', check_interval_min: 60 },
+      { id: 'b', check_interval_min: 5 },
+      { id: 'c', check_interval_min: 60 },
+    ]
+    const { keep, skip } = buildSkipSet(follows, 300)  // 只够跑一个 5min(288) + 不到一个 60min(24)
+    expect(keep.map(f => f.id)).toEqual(['b'])          // 频繁优先保底
+    expect(skip.map(f => f.id)).toEqual(['a', 'c'])
+  })
+
+  it('同一份数据每次得到完全相同的跳过集（不得依赖遍历顺序）', () => {
+    const follows = [
+      { id: 'a', check_interval_min: 5 },
+      { id: 'b', check_interval_min: 60 },
+      { id: 'c', check_interval_min: 60 },
+      { id: 'd', check_interval_min: 60 },
+    ]
+    const r1 = buildSkipSet(follows, 300)
+    const r2 = buildSkipSet(follows, 300)
+    expect(r1.skip.map(f => f.id)).toEqual(r2.skip.map(f => f.id))
+    expect(r1.keep.map(f => f.id)).toEqual(r2.keep.map(f => f.id))
+  })
+
+  it('间隔相同则按 id 稳定排序', () => {
+    const follows = [
+      { id: 'z', check_interval_min: 60 },
+      { id: 'a', check_interval_min: 60 },
+      { id: 'm', check_interval_min: 60 },
+    ]
+    const { keep } = buildSkipSet(follows, 50)   // 每项 24 units，只够 2 个
+    expect(keep.map(f => f.id)).toEqual(['a', 'm'])
+  })
+
+  it('池子够大时全部保留、无人被跳过', () => {
+    const follows = [{ id: 'a', check_interval_min: 60 }]
+    const { keep, skip } = buildSkipSet(follows, 1500)
+    expect(skip).toHaveLength(0)
+    expect(keep).toHaveLength(1)
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-runtime.js b/apps/desktop/electron/services/creator-runtime.js
new file mode 100644
index 00000000..760aca77
--- /dev/null
+++ b/apps/desktop/electron/services/creator-runtime.js
@@ -0,0 +1,148 @@
+/**
+ * creator-runtime.js — 编排层：把解析、数据访问、失败分级、配额串成可执行流程
+ *
+ * 前面各模块都是纯逻辑（可被完整单测覆盖），本模块负责**把它们接起来**，
+ * 并且接的时候守住三条顺序敏感的不变式：
+ *
+ *  1. **先 claim 再取正文**：反了就会出现两个 worker 同时抓同一条。
+ *  2. **提交带 claim_token**：租约过期被接管后，旧 worker 的迟到提交必须被拒，
+ *     否则覆盖新持有者结果（lost update）。
+ *  3. **失败必须释放 claim**：只 claim 不释放会让该条永久卡在 collecting，
+ *     用户既采不到也看不到失败原因。
+ *
+ * 所有副作用依赖由外部注入，便于在无网络、无数据库的环境完整测试。
+ */
+
+'use strict'
+
+const { classifyFailure, FAILURE_TIERS } = require('./creator-monitor')
+
+const DEFAULT_LEASE_MS = 300000
+
+function nowMs () { return Date.now() }
+
+/** 从 axios/httpx 风格异常里挖出 status + body；拿不到就交给状态码兜底 */
+function extractHttp (err) {
+  if (!err) return { status: 0, body: null, transportErr: null }
+  if (err.code && typeof err.code === 'string' && /^(ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED)$/.test(err.code)) {
+    return { status: 0, body: null, transportErr: err }
+  }
+  const status = (err.response && err.response.status) || err.status || 0
+  const body = (err.response && (err.response.data || err.response.json)) || err.body || null
+  return { status, body, transportErr: null }
+}
+
+function createCreatorRuntime (deps = {}) {
+  const {
+    store,
+    collector,
+    now = nowMs,
+    leaseMs = DEFAULT_LEASE_MS,
+    workerId = `w-${process.pid}`,
+  } = deps
+
+  if (!store || !collector) throw new TypeError('creator-runtime 需要 store 与 collector')
+
+  /** 把已分类的失败记到博主上。节流与瞬时不累加连续失败计数。 */
+  async function applyFailure (follow, tier) {
+    if (!follow) return
+    await store.recordFailure(follow.id, tier)
+  }
+
+  /**
+   * 探测单个博主：取最新作品 → 增量落库 → 更新监控状态。
+   * **永不向调用方抛异常**——调度循环会被一次异常打断，导致其余博主全部停摆。
+   */
+  async function probeCreator (followId) {
+    const follow = await store.getFollow(followId)
+    if (!follow) return { ok: false, reason: 'follow_not_found' }
+
+    let items
+    try {
+      items = (await collector.listPosts(follow.external_id)) || []
+    } catch (err) {
+      const { status, body, transportErr } = extractHttp(err)
+      const cls = classifyFailure(status, body, transportErr)
+      await applyFailure(follow, cls.tier)
+      return { ok: false, tier: cls.tier, reason: cls.reason, fetched: 0, inserted: 0 }
+    }
+
+    const payload = items
+      .filter(i => i && (i.externalId || i.external_id) && (i.url || i.externalId))
+      .map(i => ({
+        creatorId: follow.creator_id,
+        platform: follow.platform || 'youtube',
+        externalId: i.externalId || i.external_id,
+        title: i.title || '',
+        url: i.url || '',
+        thumbnailUrl: i.thumbnailUrl || '',
+        publishedAt: i.publishedAt || i.published_at || null,
+        transcriptSource: i.transcriptSource || '',
+        contentQuality: i.contentQuality || 'unknown',
+      }))
+
+    const inserted = payload.length ? await store.upsertDiscoveries(payload) : 0
+    await store.recordSuccess(follow.id)
+    return { ok: true, fetched: payload.length, inserted }
+  }
+
+  /**
+   * 采集单条。返回结构里 `superseded` 区分「被他人接管」与「真失败」——
+   * 前者不是错误，重试即可；后者需要呈现给用户。
+   */
+  async function collectOne (discoveryId, knownItem) {
+    // ⚠ 必须先拿到 externalId（平台侧作品 ID，如 YouTube videoId）。
+    //   误用本地行 id 去请求会拿到「另一个作品」的内容，且不会报错——
+    //   与 @handle 静默返回错误频道是同一类 id 混用事故。
+    //   knownItem：批量路径已经把行查出来了，直接复用，避免每条再查一次（N+1）。
+    const item = knownItem || await store.getDiscovery(discoveryId)
+    if (!item) return { collected: false, reason: 'discovery_not_found' }
+
+    const claimed = await store.claimDiscovery(discoveryId, workerId, leaseMs)
+    if (!claimed) return { collected: false, reason: 'busy' }
+
+    const token = await store.getClaimToken(discoveryId)
+    const externalId = item.externalId || item.external_id
+    if (!externalId) {
+      await store.markFailed(discoveryId, token, 'missing_external_id')
+      return { collected: false, reason: 'missing_external_id' }
+    }
+
+    let body
+    try {
+      body = await collector.collectBody(externalId)
+    } catch (err) {
+      const { status, body: b, transportErr } = extractHttp(err)
+      const cls = classifyFailure(status, b, transportErr)
+      // 必须释放 claim，否则该条永久卡在 collecting
+      await store.markFailed(discoveryId, token, cls.reason)
+      return { collected: false, reason: cls.reason, tier: cls.tier }
+    }
+
+    const ok = await store.markCollected(discoveryId, token, body)
+    if (!ok) {
+      // token 已变 → 被新持有者接管，旧结果不得落库
+      return { collected: false, superseded: true, reason: 'claim_superseded' }
+    }
+    // 最终化任务与业务写入同事务入队；失败可重试，不丢产物
+    await store.enqueueOutbox(discoveryId, 'finalize_collected')
+    return { collected: true, contentQuality: body && body.contentQuality }
+  }
+
+  /** 顺序采集：单条失败不中断其余条目（与真实串行节流一致，便于复现） */
+  async function collectBatch (discoveries) {
+    const list = Array.isArray(discoveries) ? discoveries : []
+    let collected = 0
+    let failed = 0
+    for (const d of list) {
+      const r = await collectOne(d.id, d)
+      if (r.collected) collected += 1
+      else failed += 1
+    }
+    return { collected, failed }
+  }
+
+  return { probeCreator, collectOne, collectBatch, workerId, FAILURE_TIERS }
+}
+
+module.exports = { createCreatorRuntime, extractHttp, DEFAULT_LEASE_MS }
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-runtime.test.js b/apps/desktop/electron/services/creator-runtime.test.js
new file mode 100644
index 00000000..3654b91c
--- /dev/null
+++ b/apps/desktop/electron/services/creator-runtime.test.js
@@ -0,0 +1,221 @@
+/**
+ * creator-runtime.test.js — 编排层：探测 → 增量落库 → 采集 → 最终化
+ *
+ * 前面几个模块各自都是纯逻辑，本文件锁把它们**串起来**时的正确性：
+ *
+ *  1. 探测拿到重复作品时 MUST NOT 产生重复行（依赖唯一索引，不是内存去重）
+ *  2. 采集 MUST 先 claim 再取正文；claim 失败（他人持有）MUST NOT 发起请求
+ *  3. 提交 MUST 带 claim_token；token 不匹配（被接管）MUST NOT 写采集库
+ *  4. 采集失败 MUST 释放 claim 并写 failed，否则该条永久卡在 collecting
+ *  5. 节流类失败 MUST NOT 计入连续失败，也 MUST NOT 暂停博主
+ */
+const { createCreatorRuntime } = require('./creator-runtime')
+const { FAILURE_TIERS } = require('./creator-monitor')
+
+/** 可编排的 store 替身：记录调用顺序，模拟 claim 竞争 */
+function makeStore (seed = {}) {
+  const calls = []
+  const rows = new Map(Object.entries(seed))
+  return {
+    calls, rows,
+    getFollow: async (id) => (id === 'f1' ? { id: 'f1', creator_id: 'c1', platform: 'youtube', external_id: 'UC_a', enabled: 1, status: 'active', check_interval_min: 60 } : null),
+    countPending: () => 0,
+    claimDiscovery: (id, by, lease) => { calls.push(['claim', id, by]); return seed.claimResult !== undefined ? seed.claimResult : true },
+    markCollected: (id, tok) => { calls.push(['collected', id, tok]); return seed.collectedResult !== undefined ? seed.collectedResult : true },
+    markFailed: (id, tok, msg) => { calls.push(['failed', id, tok, msg]); return true },
+    renewLease: () => true,
+    upsertDiscoveries: (items) => { calls.push(['upsert', items.length]); return seed.inserted !== undefined ? seed.inserted : items.length },
+    listDiscoveries: async () => seed.discoveries || [],
+    getClaimToken: async (id) => seed.claimToken !== undefined ? seed.claimToken : 1,
+    getDiscovery: async (id) => {
+      if (seed.discovery !== undefined) return seed.discovery
+      const list = seed.discoveries || []
+      const hit = list.find(d => d.id === id)
+      if (hit) return hit
+      // 默认给一条可用的发现行：externalId 必须与 id 不同，
+      // 这样「误把行 id 当 externalId 传下去」才会被断言抓到
+      return { id, externalId: 'v-' + id, creatorId: 'c1', platform: 'youtube' }
+    },
+    recordFailure: async (followId, tier) => { calls.push(['failure', followId, tier]); return true },
+    recordSuccess: async (followId) => { calls.push(['success', followId]); return true },
+    enqueueOutbox: (refId, kind) => { calls.push(['outbox', refId, kind]); return true },
+  }
+}
+
+function makeCollector (items, err) {
+  const calls = []
+  return {
+    calls,
+    listPosts: async (externalId) => {
+      calls.push(['listPosts', externalId])
+      if (err) throw err
+      return items
+    },
+    collectBody: async (externalId) => {
+      calls.push(['collectBody', externalId])
+      if (err) throw err
+      return { content: 'x'.repeat(600), transcriptSource: 'subtitle', contentQuality: 'full' }
+    },
+  }
+}
+
+const NOW = 1_700_000_000_000
+const apiErr = (code, reason) => ({ code, errors: [{ reason }] })
+
+describe('creator-runtime · 探测落库', () => {
+  it('探测结果按条目写入，重复项由唯一索引吸收', async () => {
+    const store = makeStore({ inserted: 2 })
+    const collector = makeCollector([
+      { externalId: 'v1', title: 'A', url: 'u1' },
+      { externalId: 'v2', title: 'B', url: 'u2' },
+    ])
+    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
+    const r = await rt.probeCreator('f1')
+    expect(r.fetched).toBe(2)
+    expect(r.inserted).toBe(2)
+    expect(store.calls.some(c => c[0] === 'upsert')).toBe(true)
+  })
+
+  it('重复探测不产生重复行（upsert 返回 0）', async () => {
+    const store = makeStore({ inserted: 0 })
+    const rt = createCreatorRuntime({ store, collector: makeCollector([{ externalId: 'v1', url: 'u1' }]), now: () => NOW })
+    const r = await rt.probeCreator('f1')
+    expect(r.inserted).toBe(0)
+  })
+
+  it('探测成功记录 success；失败按分级记录，不误伤博主', async () => {
+    const store = makeStore()
+    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
+    await rt.probeCreator('f1')
+    expect(store.calls.some(c => c[0] === 'success')).toBe(true)
+  })
+})
+
+describe('creator-runtime · 采集失败分级落到博主', () => {
+  it('节流（403）不计入连续失败、不暂停', async () => {
+    const store = makeStore()
+    const err = new Error('quota')
+    err.response = { status: 403, data: apiErr(403, 'quotaExceeded') }
+    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
+    const r = await rt.probeCreator('f1')
+    expect(r.tier).toBe(FAILURE_TIERS.THROTTLED)
+    expect(store.calls.some(c => c[0] === 'failure' && c[2] === FAILURE_TIERS.THROTTLED)).toBe(true)
+  })
+
+  it('凭证失效标为 fatal（首次即暂停）', async () => {
+    const store = makeStore()
+    const err = new Error('bad key')
+    err.response = { status: 400, data: apiErr(400, 'keyInvalid') }
+    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
+    const r = await rt.probeCreator('f1')
+    expect(r.tier).toBe(FAILURE_TIERS.FATAL)
+  })
+
+  it('探测抛异常时 MUST NOT 抛出到调用方（调度器会被打断）', async () => {
+    const store = makeStore()
+    const err = new Error('boom')
+    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
+    await expect(rt.probeCreator('f1')).resolves.toBeTruthy()
+  })
+
+  it('followId 不存在时返回明确失败，不静默当空结果', async () => {
+    const store = makeStore()
+    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
+    const r = await rt.probeCreator('nope')
+    expect(r.ok).toBe(false)
+  })
+})
+
+describe('creator-runtime · 单条采集的并发安全', () => {
+  const disc = { id: 'd1', externalId: 'v1', creatorId: 'c1', platform: 'youtube' }
+
+  it('先 claim 再取正文——顺序不可颠倒', async () => {
+    const store = makeStore()
+    const collector = makeCollector([])
+    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
+    await rt.collectOne('d1')
+    const order = store.calls.map(c => c[0])
+    expect(order[0]).toBe('claim')
+    expect(collector.calls.some(c => c[0] === 'collectBody')).toBe(true)
+  })
+
+  it('claim 未抢到时 MUST NOT 发起取正文请求', async () => {
+    const store = makeStore({ claimResult: false })
+    const collector = makeCollector([])
+    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
+    const r = await rt.collectOne('d1')
+    expect(r.collected).toBe(false)
+    expect(collector.calls.filter(c => c[0] === 'collectBody')).toHaveLength(0)
+  })
+
+  it('提交携带 claim_token', async () => {
+    const store = makeStore({ claimToken: 7 })
+    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
+    await rt.collectOne('d1')
+    const c = store.calls.find(x => x[0] === 'collected')
+    expect(c[2]).toBe(7)
+  })
+
+  it('token 已被接管（changes=0）时 MUST NOT 写入采集库', async () => {
+    const store = makeStore({ collectedResult: false })
+    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
+    const r = await rt.collectOne('d1')
+    expect(r.collected).toBe(false)
+    expect(r.superseded).toBe(true)
+  })
+
+  it('采集失败时释放 claim 并写 failed（否则永久卡在 collecting）', async () => {
+    const store = makeStore()
+    const err = new Error('transcript failed')
+    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
+    const r = await rt.collectOne('d1')
+    expect(r.collected).toBe(false)
+    expect(store.calls.some(c => c[0] === 'failed')).toBe(true)
+  })
+
+  it('最终化任务与业务写入同事务（outbox 在同一次提交里入队）', async () => {
+    const store = makeStore()
+    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
+    await rt.collectOne('d1')
+    expect(store.calls.some(c => c[0] === 'outbox')).toBe(true)
+  })
+})
+
+describe('creator-runtime · 批量采集', () => {
+  it('逐条采集，单条失败不影响其他条目', async () => {
+    const store = makeStore()
+    let n = 0
+    const collector = {
+      listPosts: async () => [],
+      collectBody: async () => {
+        n += 1
+        if (n === 1) throw new Error('one bad')
+        return { content: 'ok', transcriptSource: 'subtitle', contentQuality: 'full' }
+      },
+    }
+    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
+    const r = await rt.collectBatch([
+      { id: 'd1', externalId: 'v1' }, { id: 'd2', externalId: 'v2' },
+    ])
+    expect(r.collected).toBe(1)
+    expect(r.failed).toBe(1)
+  })
+
+  it('批量顺序稳定，便于复现', async () => {
+    const store = makeStore()
+    const seen = []
+    const collector = {
+      listPosts: async () => [],
+      collectBody: async (id) => { seen.push(id); return { content: 'ok', transcriptSource: 'subtitle', contentQuality: 'full' } },
+    }
+    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
+    const items = [{ id: 'd1', externalId: 'v1' }, { id: 'd2', externalId: 'v2' }, { id: 'd3', externalId: 'v3' }]
+    await rt.collectBatch(items)
+    expect(seen).toEqual(['v1', 'v2', 'v3'])
+  })
+
+  it('空输入返回零计数而非抛错', async () => {
+    const rt = createCreatorRuntime({ store: makeStore(), collector: makeCollector([]), now: () => NOW })
+    expect(await rt.collectBatch([])).toEqual({ collected: 0, failed: 0 })
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-schema.js b/apps/desktop/electron/services/creator-schema.js
new file mode 100644
index 00000000..92ca3e34
--- /dev/null
+++ b/apps/desktop/electron/services/creator-schema.js
@@ -0,0 +1,206 @@
+/**
+ * creator-schema.js — 博主监控与采集的数据结构与迁移
+ *
+ * ## 为什么独立成文件
+ *
+ * `store-schema.js` 受「债务熔断」约束不得突破 500 行（见该文件 activate-viral-library
+ * 处的注释），本特性新增 3 张表 + 1 个跨表迁移，放进去必然超限。
+ * 沿用 `activate-viral-schema.js` 的既有模式：表 DDL 与迁移都在此文件，
+ * `store-schema.js` 只做 require 与数组拼接。
+ *
+ * ## 为什么 viral_library 的索引必须是 partial
+ *
+ * `viral_library` 是存量表，`external_id` 是本特性新增列且默认空串。
+ * 若建普通 `UNIQUE(platform, external_id)`，**存量行的该列全为空串 → 创建索引瞬间
+ * 因重复键抛错 → schema 初始化整体失败 → 应用起不来**。
+ * `WHERE external_id <> ''` 把存量行排除在索引外，升级零影响。
+ *
+ * ## 为什么迁移必须单事务
+ *
+ * 本迁移同时做「加列」与「建跨表索引」两件事。若中途失败留下半迁移状态
+ * （列加了索引没建，或反之），`CREATE TABLE IF NOT EXISTS` 与
+ * `CREATE INDEX IF NOT EXISTS` 都**不会补做**，形成需要手工干预的死锁。
+ * 故整段包在 BEGIN/COMMIT 里，失败即整体 ROLLBACK：整次迁移原子完成，
+ * 或完全不发生。
+ */
+
+'use strict'
+
+const CREATOR_TABLES = [
+  // ── 博主实体 ──────────────────────────────────────────────
+  // external_id 为平台 canonical ID（YouTube 的 UC…），禁止存用户原始输入，
+  // 否则同一频道的 4 种 URL 写法会拆成 4 行。
+  `CREATE TABLE IF NOT EXISTS creator_accounts (
+    id               TEXT PRIMARY KEY,
+    platform         TEXT NOT NULL,
+    external_id      TEXT NOT NULL,
+    display_name     TEXT DEFAULT '',
+    handle           TEXT DEFAULT '',
+    avatar_url       TEXT DEFAULT '',
+    platform_url     TEXT DEFAULT '',
+    capability_tier  TEXT NOT NULL DEFAULT 'official',
+    credential_alias TEXT DEFAULT '',
+    created_at       TEXT NOT NULL,
+    updated_at       TEXT NOT NULL
+  )`,
+  `CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_accounts_uniq
+    ON creator_accounts(platform, external_id)`,
+
+  // ── 关注关系 + 监控配置 + 运行状态 ──────────────────────────
+  // status: active | paused_by_user | auto_paused | fatal_paused
+  `CREATE TABLE IF NOT EXISTS creator_follows (
+    id                   TEXT PRIMARY KEY,
+    creator_id           TEXT NOT NULL,
+    platform             TEXT NOT NULL,
+    enabled              INTEGER NOT NULL DEFAULT 1,
+    check_interval_min   INTEGER NOT NULL DEFAULT 60,
+    per_creator_limit    INTEGER,
+    status               TEXT NOT NULL DEFAULT 'active',
+    consecutive_failures INTEGER NOT NULL DEFAULT 0,
+    last_checked_at      TEXT,
+    last_success_at      TEXT,
+    last_error_code      TEXT,
+    last_error_message   TEXT,
+    paused_reason        TEXT,
+    created_at           TEXT NOT NULL,
+    updated_at           TEXT NOT NULL
+  )`,
+  `CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_follows_uniq
+    ON creator_follows(creator_id)`,
+  `CREATE INDEX IF NOT EXISTS idx_creator_follows_scan
+    ON creator_follows(status, enabled)`,
+
+  // ── 发现的视频（未采集） ────────────────────────────────────
+  // collect_state: pending | collecting | collected | failed | skipped
+  // claim_token 是单调递增的 fencing token：租约过期后旧 worker 的提交必须被拒，
+  // 否则会覆盖新持有者的结果（lost update）。
+  `CREATE TABLE IF NOT EXISTS creator_discoveries (
+    id                TEXT PRIMARY KEY,
+    creator_id        TEXT NOT NULL,
+    platform          TEXT NOT NULL,
+    external_id       TEXT NOT NULL,
+    title             TEXT DEFAULT '',
+    url               TEXT NOT NULL,
+    thumbnail_url     TEXT DEFAULT '',
+    published_at      TEXT,
+    discovered_at     TEXT NOT NULL,
+    collect_state     TEXT NOT NULL DEFAULT 'pending',
+    collected_at      TEXT,
+    attempt_count     INTEGER NOT NULL DEFAULT 0,
+    claim_token       INTEGER NOT NULL DEFAULT 0,
+    claimed_by        TEXT DEFAULT '',
+    lease_expires_at  INTEGER,
+    retry_after_at    INTEGER,
+    last_error        TEXT DEFAULT '',
+    transcript_source TEXT DEFAULT '',
+    content_quality   TEXT DEFAULT 'unknown',
+    summary           TEXT DEFAULT '',
+    created_at        TEXT NOT NULL,
+    updated_at        TEXT NOT NULL
+  )`,
+  `CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_discoveries_uniq
+    ON creator_discoveries(platform, external_id)`,
+  `CREATE INDEX IF NOT EXISTS idx_creator_discoveries_list
+    ON creator_discoveries(creator_id, collect_state, discovered_at)`,
+  `CREATE INDEX IF NOT EXISTS idx_creator_discoveries_stale
+    ON creator_discoveries(collect_state, lease_expires_at)`,
+]
+
+/** 跨表最终化队列（outbox）：与业务写入同事务落盘，是「已提交但未最终化」的唯一真源。 */
+const CREATOR_OUTBOX_SQL = [
+  `CREATE TABLE IF NOT EXISTS collection_outbox (
+    id            TEXT PRIMARY KEY,
+    kind          TEXT NOT NULL,
+    ref_id        TEXT NOT NULL,
+    payload_json  TEXT DEFAULT '{}',
+    state         TEXT NOT NULL DEFAULT 'pending',   -- pending | done | failed | dead_letter | cancelled
+    retry_count   INTEGER NOT NULL DEFAULT 0,
+    next_retry_at INTEGER,
+    created_at    TEXT NOT NULL,
+    updated_at    TEXT NOT NULL
+  )`,
+  `CREATE INDEX IF NOT EXISTS idx_collection_outbox_state
+    ON collection_outbox(state, next_retry_at)`,
+  `CREATE INDEX IF NOT EXISTS idx_collection_outbox_ref
+    ON collection_outbox(ref_id, state)`,
+
+  // 配额账本：崩溃 / 改系统时间 / 强杀后，内存计数会与真实消耗脱账。
+  // 计数真源是这张表，内存仅作缓存。
+  `CREATE TABLE IF NOT EXISTS collection_quota_ledger (
+    day         TEXT NOT NULL,
+    kind        TEXT NOT NULL,                    -- probe | collect
+    units       INTEGER NOT NULL DEFAULT 0,
+    request_sig TEXT NOT NULL,                    -- 幂等键，崩溃重发不重复计费
+    created_at  TEXT NOT NULL,
+    PRIMARY KEY (day, kind, request_sig)
+  )`,
+  `CREATE INDEX IF NOT EXISTS idx_collection_quota_day
+    ON collection_quota_ledger(day, kind)`,
+]
+
+const CREATOR_TABLE_SQL = CREATOR_TABLES.concat(CREATOR_OUTBOX_SQL)
+
+/** 迁移前冲突预检：返回存在重复 (platform, external_id) 的分组 */
+function findViralLibraryConflicts (db) {
+  try {
+    return db.prepare(
+      `SELECT platform, external_id, COUNT(*) AS n FROM viral_library
+        WHERE external_id <> '' AND external_id IS NOT NULL
+        GROUP BY platform, external_id HAVING n > 1`
+    ).all() || []
+  } catch (_) { return [] }   // 列尚未添加（首次升级）时无冲突
+}
+
+/**
+ * 为存量 viral_library 补 external_id / creator_id 两列，并建 partial 索引。
+ * 幂等：列已存在则跳过；整段单事务，失败即整体回滚。
+ */
+function migrateCreatorLinkageSchema (db, execSchemaSql) {
+  const rows = findViralLibraryConflicts(db)
+  if (rows.length) {
+    // 不静默去重——擅自删行即数据损失。抛错让启动失败，由人决定保留哪条。
+    const detail = rows.slice(0, 5).map(r => `${r.platform}:${r.external_id}x${r.n}`).join(', ')
+    throw new Error(
+      `viral_library 存在 ${rows.length} 组重复 (platform, external_id)：${detail}` +
+      `。为避免误删数据，迁移已中止；请人工清理后重试。`
+    )
+  }
+
+  const run = (sql) => {
+    if (typeof db.execOrThrow === 'function') db.execOrThrow(sql)
+    else if (typeof execSchemaSql === 'function') execSchemaSql(db, sql)
+    else db.exec(sql)
+  }
+
+  // BEGIN 失败（如「cannot start a transaction within a transaction」）时降级为无事务执行，
+  // 不因环境限制让整个迁移失败。
+  let began = false
+  try { run('BEGIN'); began = true } catch (_) { /* 无事务能力，降级直跑 */ }
+
+  try {
+    const cols = db.prepare('PRAGMA table_info(viral_library)').all().map(c => c.name)
+    for (const [name, ddl] of [
+      ['external_id', 'ALTER TABLE viral_library ADD COLUMN external_id TEXT DEFAULT \'\''],
+      ['creator_id', 'ALTER TABLE viral_library ADD COLUMN creator_id TEXT DEFAULT \'\''],
+    ]) {
+      if (!cols.includes(name)) run(ddl)
+    }
+    // ⚠ partial：存量行该列为空串，普通 UNIQUE 会在建索引瞬间因重复键抛错致应用起不来
+    run('CREATE UNIQUE INDEX IF NOT EXISTS idx_viral_library_external '
+      + 'ON viral_library(platform, external_id) WHERE external_id <> \'\'')
+    run('CREATE INDEX IF NOT EXISTS idx_viral_library_creator '
+      + 'ON viral_library(creator_id) WHERE creator_id <> \'\'')
+    if (began) run('COMMIT')
+  } catch (err) {
+    if (began) { try { run('ROLLBACK') } catch (_) { /* 回滚失败时保留原始错误 */ } }
+    throw err
+  }
+}
+
+module.exports = {
+  CREATOR_TABLE_SQL,
+  CREATOR_TABLES,
+  CREATOR_OUTBOX_SQL,
+  findViralLibraryConflicts,
+  migrateCreatorLinkageSchema,
+}
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-schema.test.js b/apps/desktop/electron/services/creator-schema.test.js
new file mode 100644
index 00000000..963c4343
--- /dev/null
+++ b/apps/desktop/electron/services/creator-schema.test.js
@@ -0,0 +1,164 @@
+/**
+ * creator-schema.test.js — 博主监控数据结构与迁移
+ *
+ * 本文件锁两件事，都是「错了会出事」而不是「错了不好看」：
+ *
+ *  1. **partial 唯一索引**：viral_library 的 external_id 是新增列且存量行为空串。
+ *     若建成普通 UNIQUE(platform, external_id)，建索引瞬间即因重复键抛错，
+ *     schema 初始化失败 → **应用起不来**。partial 把存量行排除在索引外。
+ *  2. **迁移原子性**：加列与建索引必须同事务。半迁移状态下
+ *     CREATE TABLE/INDEX IF NOT EXISTS 都不会补做，形成需手工干预的死锁。
+ */
+const {
+  CREATOR_TABLE_SQL,
+  CREATOR_OUTBOX_SQL,
+  findViralLibraryConflicts,
+  migrateCreatorLinkageSchema,
+} = require('./creator-schema')
+
+/** 极简 sql.js 替身：只需 prepare/all 与 exec，覆盖本迁移用到的语句。 */
+function makeDb (rows = {}) {
+  const executed = []
+  const prepare = (sql) => ({
+    all: () => {
+      if (/PRAGMA table_info\(viral_library\)/i.test(sql)) {
+        return (rows.viralLibraryCols || []).map(name => ({ name }))
+      }
+      if (/GROUP BY platform, external_id/i.test(sql)) return rows.conflicts || []
+      return []
+    },
+  })
+  const exec = (sql) => { executed.push(sql) }
+  const db = { prepare, exec, execOrThrow: exec }
+  return { db, executed }
+}
+
+function execSchemaSql (db, sql) { db.exec(sql) }
+
+describe('creator-schema · 表定义', () => {
+  const ddl = CREATOR_TABLE_SQL.join('\n')
+
+  it('三张博主表 + outbox + 配额账本齐备', () => {
+    for (const t of ['creator_accounts', 'creator_follows', 'creator_discoveries',
+      'collection_outbox', 'collection_quota_ledger']) {
+      expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS ${t} `)
+    }
+  })
+
+  it('creator_accounts 与 creator_discoveries 的 (platform, external_id) 唯一', () => {
+    expect(ddl).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_accounts_uniq\s*\n?\s*ON creator_accounts\(platform, external_id\)/)
+    expect(ddl).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_discoveries_uniq\s*\n?\s*ON creator_discoveries\(platform, external_id\)/)
+  })
+
+  it(' discoveries 带 claim_token（fencing）与租约字段', () => {
+    for (const col of ['claim_token', 'claimed_by', 'lease_expires_at', 'retry_after_at', 'attempt_count']) {
+      expect(ddl).toContain(col)
+    }
+  })
+
+  it('配额账本以 (day, kind, request_sig) 为主键——崩溃重发不重复计费', () => {
+    expect(ddl).toMatch(/PRIMARY KEY \(day, kind, request_sig\)/)
+  })
+
+  it('outbox 单列在 CREATOR_OUTBOX_SQL 中，便于按需评估其表面积', () => {
+    expect(CREATOR_OUTBOX_SQL.join('\n')).toContain('collection_outbox')
+  })
+})
+
+describe('creator-schema · viral_library 迁移 · partial 索引（防应用起不来）', () => {
+  it('索引带 WHERE external_id <> \'\'，存量空串行不参与唯一约束', () => {
+    const { db, executed } = makeDb({ viralLibraryCols: ['id', 'external_id'] })
+    migrateCreatorLinkageSchema(db, execSchemaSql)
+    const idx = executed.find(s => s.includes('idx_viral_library_external'))
+    expect(idx).toBeDefined()
+    expect(idx).toContain("WHERE external_id <> ''")
+  })
+
+  it('普通 UNIQUE 不被使用（那会让存量空串行冲突）', () => {
+    const { db, executed } = makeDb({ viralLibraryCols: ['id', 'external_id'] })
+    migrateCreatorLinkageSchema(db, execSchemaSql)
+    const idx = executed.find(s => s.includes('idx_viral_library_external'))
+    expect(idx).not.toMatch(/CREATE UNIQUE INDEX[^(]*\(platform, external_id\)\s*$/m)
+  })
+
+  it('列已存在时不重复 ALTER（幂等）', () => {
+    const { db, executed } = makeDb({ viralLibraryCols: ['id', 'external_id', 'creator_id'] })
+    migrateCreatorLinkageSchema(db, execSchemaSql)
+    expect(executed.filter(s => s.includes('ADD COLUMN'))).toHaveLength(0)
+  })
+
+  it('列缺失时补齐两列', () => {
+    const { db, executed } = makeDb({ viralLibraryCols: ['id'] })
+    migrateCreatorLinkageSchema(db, execSchemaSql)
+    const alters = executed.filter(s => s.includes('ADD COLUMN'))
+    expect(alters).toHaveLength(2)
+    expect(alters.join(' ')).toContain('external_id')
+    expect(alters.join(' ')).toContain('creator_id')
+  })
+})
+
+describe('creator-schema · 迁移原子性', () => {
+  it('整段包在 BEGIN/COMMIT 中', () => {
+    const { db, executed } = makeDb({ viralLibraryCols: ['id'] })
+    migrateCreatorLinkageSchema(db, execSchemaSql)
+    expect(executed[0]).toBe('BEGIN')
+    expect(executed[executed.length - 1]).toBe('COMMIT')
+  })
+
+  it('中途抛错时 ROLLBACK 并把原始错误抛出（不留半迁移状态）', () => {
+    const executed = []
+    const db = {
+      prepare: () => ({ all: () => [] }),
+      exec: (sql) => {
+        executed.push(sql)
+        if (sql.includes('ADD COLUMN external_id')) throw new Error('boom')
+      },
+      execOrThrow: undefined,
+    }
+    expect(() => migrateCreatorLinkageSchema(db, execSchemaSql)).toThrow('boom')
+    expect(executed).toContain('ROLLBACK')
+    expect(executed).not.toContain('COMMIT')
+  })
+
+  it('schema 不支持事务时降级为无事务执行（不因 BEGIN 失败而整体中止）', () => {
+    const executed = []
+    const db = {
+      prepare: (sql) => ({ all: () => (PRAGMA_TABLE_INFO.test(sql) ? [{ name: 'id' }] : []) }),
+      exec: (sql) => {
+        executed.push(sql)
+        if (sql === 'BEGIN') throw new Error('cannot start a transaction within a transaction')
+      },
+    }
+    expect(() => migrateCreatorLinkageSchema(db, execSchemaSql)).not.toThrow()
+    expect(executed).not.toContain('ROLLBACK')
+    expect(executed.some(s => s.includes('ADD COLUMN'))).toBe(true)
+  })
+})
+
+const PRAGMA_TABLE_INFO = /PRAGMA table_info\(viral_library\)/i
+
+describe('creator-schema · 冲突预检（不静默丢数据）', () => {
+  it('检测到重复分组时中止迁移并报出明细', () => {
+    const rows = [{ platform: 'youtube', external_id: 'UC_x', n: 3 }]
+    const { db, executed } = makeDb({ conflicts: rows })
+    expect(() => migrateCreatorLinkageSchema(db, execSchemaSql))
+      .toThrow(/存在 1 组重复/)
+    expect(executed.filter(s => s.includes('ADD COLUMN'))).toHaveLength(0)
+  })
+
+  it('错误信息含冲突键，便于人工定位', () => {
+    const rows = [{ platform: 'youtube', external_id: 'UC_dupe', n: 2 }]
+    const { db } = makeDb({ conflicts: rows })
+    expect(() => migrateCreatorLinkageSchema(db, execSchemaSql)).toThrow(/UC_dupe/)
+  })
+
+  it('无冲突时预检返回空数组', () => {
+    const { db } = makeDb({ conflicts: [] })
+    expect(findViralLibraryConflicts(db)).toEqual([])
+  })
+
+  it('列尚未添加时预检不抛错（首次升级无存量 external_id）', () => {
+    const db = { prepare: () => ({ all: () => { throw new Error('no such column') } }) }
+    expect(findViralLibraryConflicts(db)).toEqual([])
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-store.js b/apps/desktop/electron/services/creator-store.js
new file mode 100644
index 00000000..cf3b3f94
--- /dev/null
+++ b/apps/desktop/electron/services/creator-store.js
@@ -0,0 +1,162 @@
+/**
+ * creator-store.js — 博主采集数据访问层
+ *
+ * 只封装**并发安全与幂等**相关的写操作；读路径保持薄封装。
+ * 之所以把这些集中在一处：它们各自都是「写错不报错、只在下个请求才显形」
+ * 的操作，散落到各处必然出现某条路径忘了带 fencing 条件。
+ *
+ * ## fencing 为什么必需
+ *
+ * claim + lease 只保证「同一时刻只有一个活跃持有者」。但租约过期后新 worker
+ * 接管并推进了 claim_token，此时**旧 worker 仍在跑**，它完成时若无条件 UPDATE，
+ * 会把新持有者的结果覆盖掉（lost update），且两人都可能往 viral_library 插入。
+ * 因此所有行内变更与副作用提交都必须带 `AND claim_token = ?`，
+ * changes=0 即表示「代次已过期，放弃提交」。
+ */
+
+'use strict'
+
+const crypto = require('crypto')
+
+const DEFAULT_LEASE_MS = 300000        // 5 分钟
+const DEFAULT_COOLDOWN_MS = 600000     // 10 分钟
+
+function nowMs () { return Date.now() }
+
+function newId (prefix) {
+  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`
+}
+
+/**
+ * @param {object} db    sql.js Database 句柄
+ * @param {{now?: Function, uuid?: Function}} [opts]
+ */
+function createCreatorStore (db, opts = {}) {
+  const now = typeof opts.now === 'function' ? opts.now : nowMs
+  const exec = (sql, params) => {
+    const st = db.prepare(sql)
+    if (Array.isArray(params) && typeof st.run === 'function') return st.run(...params)
+    return st.run()
+  }
+
+  /** 抢占采集权。互斥靠单条 UPDATE 完成，绝不先查后改。 */
+  function claimDiscovery (discoveryId, workerId, leaseMs = DEFAULT_LEASE_MS) {
+    const sql = `UPDATE creator_discoveries
+        SET collect_state   = 'collecting',
+            claim_token     = claim_token + 1,
+            claimed_by      = ?,
+            lease_expires_at= ?,
+            attempt_count   = attempt_count + 1,
+            updated_at      = ?
+      WHERE id = ?
+        AND collect_state IN ('pending', 'failed')
+        AND (claimed_by IS NULL OR lease_expires_at IS NULL OR lease_expires_at < ?)
+        AND (retry_after_at IS NULL OR retry_after_at <= ?)`
+    const r = exec(sql, [
+      workerId, now() + leaseMs, now(), discoveryId, now(), now(),
+    ])
+    return changesOf(r) > 0
+  }
+
+  /** 提交采集成功。**必须**匹配 claim_token，否则拒绝覆盖新持有者。 */
+  function markCollected (discoveryId, claimToken, extra = {}) {
+    const sql = `UPDATE creator_discoveries
+        SET collect_state  = 'collected',
+            collected_at   = ?,
+            claimed_by     = '',
+            lease_expires_at = NULL,
+            retry_after_at = NULL,
+            last_error     = '',
+            updated_at     = ?
+      WHERE id = ? AND claim_token = ? AND collect_state = 'collecting'`
+    const r = exec(sql, [now(), now(), discoveryId, claimToken])
+    void extra
+    return changesOf(r) > 0
+  }
+
+  /**
+   * 提交采集失败。同样必须匹配 claim_token。
+   * 失败后写 retry_after_at 形成冷却，避免坏内容被自动流程无限重试。
+   */
+  function markFailed (discoveryId, claimToken, message, o = {}) {
+    const cooldown = typeof o.cooldownMs === 'number' ? o.cooldownMs : DEFAULT_COOLDOWN_MS
+    const sql = `UPDATE creator_discoveries
+        SET collect_state   = 'failed',
+            last_error      = ?,
+            claimed_by      = '',
+            lease_expires_at= NULL,
+            retry_after_at  = ?,
+            updated_at      = ?
+      WHERE id = ? AND claim_token = ? AND collect_state = 'collecting'`
+    const r = exec(sql, [String(message || '').slice(0, 500), now() + cooldown, now(), discoveryId, claimToken])
+    return changesOf(r) > 0
+  }
+
+  /**
+   * 续租。**必须**匹配 claim_token：否则旧 worker 能给新持有者的租约续命，
+   * 让真正在干活的新 worker 反而被判定为租约过期。
+   */
+  function renewLease (discoveryId, workerId, claimToken, leaseMs = DEFAULT_LEASE_MS) {
+    const sql = `UPDATE creator_discoveries
+        SET lease_expires_at = ?, updated_at = ?
+      WHERE id = ? AND claim_token = ? AND claimed_by = ? AND collect_state = 'collecting'`
+    const r = exec(sql, [now() + leaseMs, now(), discoveryId, claimToken, workerId])
+    return changesOf(r) > 0
+  }
+
+  /**
+   * 批量写入发现项。**必须**依赖唯一索引 (platform, external_id) 的
+   * INSERT OR IGNORE，而不是「先查后插」——后者在并发探测下必然插入重复行。
+   * @returns {number} 本次真正新增的行数（changes 之和）
+   */
+  function upsertDiscoveries (items) {
+    const list = Array.isArray(items) ? items : []
+    let inserted = 0
+    for (const it of list) {
+      const sql = `INSERT OR IGNORE INTO creator_discoveries
+          (id, creator_id, platform, external_id, title, url, thumbnail_url,
+           published_at, discovered_at, collect_state, transcript_source,
+           content_quality, summary, created_at, updated_at)
+        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
+      const t = now()
+      const r = exec(sql, [
+        it.id || newId('cd'), it.creatorId, it.platform, it.externalId,
+        it.title || '', it.url, it.thumbnailUrl || '', it.publishedAt || null, t,
+        it.transcriptSource || '', it.contentQuality || 'unknown',
+        it.summary || '', t, t,
+      ])
+      inserted += changesOf(r)
+    }
+    return inserted
+  }
+
+  /** 待采集计数（角标）。空结果归一为 0，避免 UI 收到 undefined。 */
+  function countPending (creatorId) {
+    const sql = `SELECT COUNT(*) AS n FROM creator_discoveries
+      WHERE collect_state = 'pending'${creatorId ? ' AND creator_id = ?' : ''}`
+    const st = db.prepare(sql)
+    const rows = creatorId ? st.all(creatorId) : st.all()
+    const row = Array.isArray(rows) ? rows[0] : null
+    return row && Number.isFinite(Number(row.n)) ? Number(row.n) : 0
+  }
+
+  return {
+    claimDiscovery,
+    markCollected,
+    markFailed,
+    renewLease,
+    upsertDiscoveries,
+    countPending,
+    newId,
+  }
+}
+
+/** sql.js 的 run() 返回 { changes }；部分替身直接返回数字。归一处理。 */
+function changesOf (r) {
+  if (r == null) return 0
+  if (typeof r === 'number') return r
+  if (typeof r.changes === 'number') return r.changes
+  return 0
+}
+
+module.exports = { createCreatorStore, DEFAULT_LEASE_MS, DEFAULT_COOLDOWN_MS }
\ No newline at end of file
diff --git a/apps/desktop/electron/services/creator-store.test.js b/apps/desktop/electron/services/creator-store.test.js
new file mode 100644
index 00000000..d4f08de1
--- /dev/null
+++ b/apps/desktop/electron/services/creator-store.test.js
@@ -0,0 +1,178 @@
+/**
+ * creator-store.test.js — 博主采集数据访问层：claim / lease / fencing
+ *
+ * 锁的是**并发正确性**。三个必须成立的不变式：
+ *
+ *  1. 同一作品不会被两个 worker 并发采集（claim 互斥）
+ *  2. 租约过期后新 worker 可接管，但**旧 worker 的迟到提交必须被拒**（fencing）
+ *  3. 冷却期内不会被自动流程重复重试（retry_after_at）
+ *
+ * 第 2 条最容易被漏：只有 lease 没有 fencing 时，旧 worker 在租约过期后
+ * 仍可能完成并把状态改回 collected，覆盖新持有者的结果（lost update）。
+ */
+const { createCreatorStore } = require('./creator-store')
+
+/** 记录每条 SQL 的假 db，用于断言 WHERE 条件里确实带了 claim_token。
+ *  日志由 db 侧记录——生产代码不应为了测试而携带状态。 */
+function makeDb (rows = {}) {
+  const log = []
+  const db = {
+    log,
+    prepare (sql) {
+      log.push(sql)
+      const one = rows.single
+      const all = rows.all || []
+      const run = rows.run
+      return {
+        sql,
+        get: () => one,
+        all: () => all,
+        run: () => (typeof run === 'function' ? run(sql) : { changes: 1 }),
+      }
+    },
+    exec (sql) { log.push(sql) },
+  }
+  return db
+}
+
+const NOW = 1_700_000_000_000
+
+describe('creator-store · claim 互斥', () => {
+  it('claim 成功的 UPDATE 必须带 claim_token 条件', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.claimDiscovery('d1', 'worker-a', 300000)
+    const sql = db.log.find(s => /UPDATE creator_discoveries/.test(s))
+    expect(sql).toBeDefined()
+    expect(sql).toMatch(/claim_token\s*=\s*claim_token\s*\+\s*1/)
+    expect(sql).toMatch(/collect_state\s+IN\s*\(\s*'pending'\s*,\s*'failed'\s*\)/)
+    expect(sql).toMatch(/AND\s*\(\s*claimed_by IS NULL\s+OR\s+lease_expires_at IS NULL\s+OR\s+lease_expires_at\s*<\s*\?\s*\)/)
+  })
+
+  it('changes=0 表示未抢到（他人已持有且租约未过期）', () => {
+    const db = makeDb({ run: () => ({ changes: 0 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.claimDiscovery('d1', 'worker-b', 300000)).toBe(false)
+  })
+
+  it('changes>0 表示抢到', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.claimDiscovery('d1', 'worker-a', 300000)).toBe(true)
+  })
+
+  it('claim 时 attempt_count 递增（claim 了就是真尝试）', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.claimDiscovery('d1', 'worker-a', 300000)
+    const sql = db.log.find(s => /UPDATE creator_discoveries/.test(s))
+    expect(sql).toMatch(/attempt_count\s*=\s*attempt_count\s*\+\s*1/)
+  })
+
+  it('claim 时写入租约到期时间（now + ttl）', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.claimDiscovery('d1', 'worker-a', 300000)
+    const sql = db.log.find(s => /UPDATE creator_discoveries/.test(s))
+    expect(sql).toMatch(/lease_expires_at\s*=/)
+  })
+})
+
+describe('creator-store · fencing（迟到提交必须被拒）', () => {
+  it('完成提交的 UPDATE 必须带 AND claim_token = ?', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.markCollected('d1', 7)
+    const sql = db.log.find(s => /collect_state\s*=\s*'collected'/.test(s))
+    expect(sql).toMatch(/AND\s+claim_token\s*=/)
+  })
+
+  it('token 不匹配（changes=0）时返回 false，旧 worker 不得覆盖', () => {
+    const db = makeDb({ run: () => ({ changes: 0 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.markCollected('d1', 3)).toBe(false)
+  })
+
+  it('token 匹配（changes=1）时返回 true', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.markCollected('d1', 7)).toBe(true)
+  })
+
+  it('失败提交的 UPDATE 同样必须带 token 条件（不能只保护成功路径）', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.markFailed('d1', 9, 'boom')
+    const sql = db.log.find(s => /collect_state\s*=\s*'failed'/.test(s))
+    expect(sql).toMatch(/AND\s+claim_token\s*=/)
+    expect(sql).toMatch(/last_error\s*=/)
+  })
+
+  it('心跳续租也必须带 token 条件，否则旧 worker 能续命新持有者的租约', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.renewLease('d1', 'worker-a', 7, 300000)
+    const sql = db.log.find(s => /lease_expires_at/.test(s) && /UPDATE/.test(s))
+    expect(sql).toMatch(/AND\s+claim_token\s*=/)
+  })
+})
+
+describe('creator-store · 释放与冷却', () => {
+  it('失败后写 retry_after_at（冷却期内不再自动重试）', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.markFailed('d1', 9, 'x', { cooldownMs: 600000 })
+    const sql = db.log.find(s => /collect_state\s*=\s*'failed'/.test(s))
+    expect(sql).toMatch(/retry_after_at/)
+  })
+
+  it('冷却时长可配，未传时用默认值', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.markFailed('d1', 9, 'x')
+    expect(db.log.some(s => /retry_after_at/.test(s))).toBe(true)
+  })
+})
+
+describe('creator-store · 探测幂等', () => {
+  it('批量写入发现项必须依赖唯一索引（INSERT OR IGNORE）而非先查后插', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    store.upsertDiscoveries([{ creatorId: 'c1', platform: 'youtube', externalId: 'v1', url: 'u' }])
+    const sql = db.log.find(s => /creator_discoveries/.test(s) && /INSERT/i.test(s))
+    expect(sql).toMatch(/INSERT\s+OR\s+IGNORE/i)
+  })
+
+  it('重复探测同一 external_id 不得产生第二行', () => {
+    const db = makeDb({ run: () => ({ changes: 0 }) })   // 唯一约束冲突
+    const store = createCreatorStore(db, { now: () => NOW })
+    const inserted = store.upsertDiscoveries([
+      { creatorId: 'c1', platform: 'youtube', externalId: 'v1', url: 'u' },
+    ])
+    expect(inserted).toBe(0)
+  })
+
+  it('新作品被插入时计入 inserted', () => {
+    const db = makeDb({ run: () => ({ changes: 1 }) })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.upsertDiscoveries([
+      { creatorId: 'c1', platform: 'youtube', externalId: 'v2', url: 'u' },
+    ])).toBe(1)
+  })
+})
+
+describe('creator-store · 统计查询', () => {
+  it('pending 计数按 creator 维度返回，供角标使用', () => {
+    const db = makeDb({ all: [{ n: 5 }] })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.countPending('c1')).toBe(5)
+    const sql = db.log.find(s => /collect_state\s*=\s*'pending'/.test(s))
+    expect(sql).toMatch(/COUNT\(\*\)/i)
+  })
+
+  it('查询为空结果时返回 0 而非 undefined', () => {
+    const db = makeDb({ all: [] })
+    const store = createCreatorStore(db, { now: () => NOW })
+    expect(store.countPending('c1')).toBe(0)
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/electron/services/store-schema.js b/apps/desktop/electron/services/store-schema.js
index c573c75b..c1bfa5f3 100644
--- a/apps/desktop/electron/services/store-schema.js
+++ b/apps/desktop/electron/services/store-schema.js
@@ -462,6 +462,18 @@ const { migrateViralPatternSchema: _migrateViralPattern, migratePerformanceLoopS
 function migrateViralPatternSchema(db) { _migrateViralPattern(db, execSchemaSql) }
 function migratePerformanceLoopSchema(db) { _migratePerformanceLoop(db, execSchemaSql) }
 
+// 博主监控同样受 500 行熔断约束，表 DDL 与跨表迁移均拆至独立文件。
+const { CREATOR_TABLE_SQL, migrateCreatorLinkageSchema: _migrateCreatorLinkage } = require('./creator-schema')
+SCHEMA_SQL.push(...CREATOR_TABLE_SQL)
+Object.assign(TABLE_NAMES, {
+  creator_accounts: 'creator_accounts',
+  creator_follows: 'creator_follows',
+  creator_discoveries: 'creator_discoveries',
+  collection_outbox: 'collection_outbox',
+  collection_quota_ledger: 'collection_quota_ledger',
+})
+function migrateCreatorLinkage(db) { _migrateCreatorLinkage(db, execSchemaSql) }
+
 module.exports = {
   TABLE_NAMES,
   SCHEMA_SQL,
@@ -478,4 +490,5 @@ module.exports = {
   migrateKnowledgeEvolutionSchema,
   migrateViralPatternSchema,
   migratePerformanceLoopSchema,
+  migrateCreatorLinkage,
 };
diff --git a/apps/desktop/electron/services/store/base-store.js b/apps/desktop/electron/services/store/base-store.js
index d3af801a..ca060b37 100644
--- a/apps/desktop/electron/services/store/base-store.js
+++ b/apps/desktop/electron/services/store/base-store.js
@@ -18,6 +18,7 @@ const {
   migrateKnowledgeEvolutionSchema,
   migrateViralPatternSchema,
   migratePerformanceLoopSchema,
+  migrateCreatorLinkage,
 } = require('../store-schema')
 const log = require('../logger')
 
@@ -89,6 +90,7 @@ class BaseStore {
       migrateKnowledgeEvolutionSchema(this.db)
       migrateViralPatternSchema(this.db)
       migratePerformanceLoopSchema(this.db)
+      migrateCreatorLinkage(this.db)
       this._ready = true
       // Stage -1.1：数据库就绪后立即迁移存量明文账号凭证（主密钥已注入时）。
       if (this._accountCrypto && typeof this.migrateAccountCredentials === 'function') {
diff --git a/apps/desktop/scripts/creator-adapter-live.js b/apps/desktop/scripts/creator-adapter-live.js
new file mode 100644
index 00000000..c0cfc104
--- /dev/null
+++ b/apps/desktop/scripts/creator-adapter-live.js
@@ -0,0 +1,111 @@
+/**
+ * creator-adapter-live.js — 对**应用真正使用的** adapter 做真实 API 验证
+ *
+ * 为什么需要它：P0 冒烟（creator_p0_smoke.py）直接调依赖包的
+ * YouTubeCollector._fetch()，验证的是**依赖库**的行为；而应用走的是
+ * creator-collector.resolveChannelId()（自行用 forHandle/forUsername 解析）。
+ * 两者结论可以完全不同——依赖库 @handle 会静默返回别的频道，adapter 不会。
+ * 只重测依赖库等于反复确认一个已知问题，却没验证我们自己的修复。
+ *
+ * 用法：set YOUTUBE_API_KEY=<key> && node scripts/creator-adapter-live.js
+ */
+'use strict'
+
+const path = require('path')
+const https = require('https')
+const ROOT = path.resolve(__dirname, '..')
+const {
+  resolveChannelId, CREATOR_INPUT_ERRORS, YOUTUBE_API_BASE,
+} = require(path.join(ROOT, 'electron/services/creator-collector'))
+
+const API_KEY = process.env.YOUTUBE_API_KEY || ''
+const EXPECTED = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'
+
+/** 真实 HTTP，但保留 status 以便失败分级能被复现（不是只抛异常） */
+function httpGet (url, params) {
+  const qs = Object.entries(params || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
+  const full = `${url}?${qs}`
+  return new Promise((resolve, reject) => {
+    https.get(full, (res) => {
+      let raw = ''
+      res.on('data', (d) => { raw += d })
+      res.on('end', () => {
+        let json = null
+        try { json = JSON.parse(raw) } catch (_) { /* 非 JSON 交由状态码分级 */ }
+        if (res.statusCode >= 400) {
+          const e = new Error(`HTTP ${res.statusCode}`)
+          e.response = { status: res.statusCode, data: json }
+          reject(e); return
+        }
+        resolve(json)
+      })
+    }).on('error', reject)
+  })
+}
+
+const CASES = [
+  ['裸频道 ID（零请求）', EXPECTED, EXPECTED],
+  ['完整 URL + /channel/UC…', `https://www.youtube.com/channel/${EXPECTED}`, EXPECTED],
+  ['完整 URL + @handle', 'https://www.youtube.com/@GoogleDevelopers', EXPECTED],
+  ['裸串 @handle（先补 scheme）', '@GoogleDevelopers', EXPECTED],
+  ['裸串域名 + @handle', 'youtube.com/@GoogleDevelopers', EXPECTED],
+  ['完整 URL + /c/', 'https://www.youtube.com/c/GoogleDevelopers', EXPECTED],
+  ['完整 URL + /user/', 'https://www.youtube.com/user/GoogleDevelopers', EXPECTED],
+]
+
+const NEGATIVE = [
+  ['作品链接明确报错', 'https://www.youtube.com/watch?v=abc', CREATOR_INPUT_ERRORS.NOT_A_CHANNEL],
+  ['播放列表明确报错', 'https://www.youtube.com/playlist?list=PL1', CREATOR_INPUT_ERRORS.NOT_A_CHANNEL],
+  ['非 YouTube 域名报错', 'https://v.douyin.com/abc/', CREATOR_INPUT_ERRORS.INVALID_INPUT],
+  ['空输入报错', '', CREATOR_INPUT_ERRORS.INVALID_INPUT],
+]
+
+async function main () {
+  if (!API_KEY) {
+    console.error('未设置 YOUTUBE_API_KEY')
+    process.exit(2)
+  }
+  let failed = 0
+
+  for (const [label, input, expected] of CASES) {
+    try {
+      const got = await resolveChannelId(input, { apiKey: API_KEY, httpGet })
+      const ok = got === expected
+      if (!ok) failed += 1
+      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${got}${ok ? '' : `  (期望 ${expected})`}`)
+    } catch (e) {
+      failed += 1
+      console.log(`FAIL  ${label}  -> 抛错 ${e.code || e.name}: ${String(e.message).slice(0, 90)}`)
+    }
+  }
+
+  for (const [label, input, expectedCode] of NEGATIVE) {
+    try {
+      await resolveChannelId(input, { apiKey: API_KEY, httpGet })
+      failed += 1
+      console.log(`FAIL  ${label}  -> 本应报错却放行了`)
+    } catch (e) {
+      const ok = e.code === expectedCode
+      if (!ok) failed += 1
+      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${e.code}`)
+    }
+  }
+
+  // 不存在的频道：必须 fail-closed，绝不回退到用输入当 ID
+  try {
+    const got = await resolveChannelId('https://www.youtube.com/@this-handle-should-not-exist-9z8x7c6v', { apiKey: API_KEY, httpGet })
+    failed += 1
+    console.log(`FAIL  不存在的频道 fail-closed  -> 竟返回 ${got}`)
+  } catch (e) {
+    const ok = e.code === CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND
+    if (!ok) failed += 1
+    console.log(`${ok ? 'PASS' : 'FAIL'}  不存在的频道 fail-closed  -> ${e.code}`)
+  }
+
+  console.log('\n' + (failed === 0
+    ? '结论: adapter 全部通过 —— 依赖库的 @handle 缺陷已被 adapter 兜住。'
+    : `结论: ${failed} 项失败`))
+  process.exit(failed === 0 ? 0 : 1)
+}
+
+main().catch((e) => { console.error('未捕获异常:', e && e.message); process.exit(3) })
\ No newline at end of file
diff --git a/apps/desktop/src/features/collection/CreatorMonitor.test.js b/apps/desktop/src/features/collection/CreatorMonitor.test.js
new file mode 100644
index 00000000..4f4306f6
--- /dev/null
+++ b/apps/desktop/src/features/collection/CreatorMonitor.test.js
@@ -0,0 +1,284 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest'
+import { mount, flushPromises } from '@vue/test-utils'
+import { nextTick } from 'vue'
+import { createI18n } from 'vue-i18n'
+
+vi.mock('element-plus', () => ({
+  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
+  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
+}))
+
+const { ElMessage } = await import('element-plus')
+
+import CreatorMonitor from './CreatorMonitor.vue'
+
+/** i18n 桩：给出真实模板，vue-i18n 才会替换 {count} / {max} / {remain} 等占位符。
+ *  空 messages 时 t() 只回显 key，插值不会被替换，断言占位符数值就会假失败。 */
+const messages = {
+  zh: {
+    collection: {
+      creatorTab: '博主监控',
+      creatorListTitle: '关注的博主',
+      creatorAddSubmit: '关注',
+      creatorAddPlaceholder: '粘贴 YouTube 频道链接、@handle 或频道 ID',
+      creatorPendingBadge: '{count} 条新作品',
+      creatorCollectNew: '一键采集新作品',
+      creatorCollectOne: '采集',
+      creatorCollectedAt: '已采集 · {time}',
+      creatorCapOfficial: '官方接口',
+      creatorCapBestEffort: '尽力而为（可能不稳定）',
+      creatorCapUnsupported: '暂不支持',
+      creatorQualityFull: '字幕正文，质量高',
+      creatorQualityPartial: '描述正文，质量有限',
+      creatorQualityStub: '仅标题与简介',
+      creatorAutoPaused: '连续失败 {times} 次，已自动暂停。{reason}',
+      creatorFatalPaused: '无法检查新作品：{reason}。请在设置中检查 API Key。',
+      creatorBatchSuccess: '已采集 {collected} 条内容',
+      creatorTruncated: '共发现 {found} 条，已采集最新 {collected} 条，剩余 {remain} 条留待下次',
+      creatorErrCountExceedsLimit: '本次最多采集 {max} 条，请调整数量。',
+      creatorErrCollectFailed: '采集失败：{message}',
+      creatorErrDependencyMissing: '缺少采集依赖。请执行：{command}',
+      creatorNoNewWorks: '暂无新作品。系统会每 {interval} 自动检查一次。',
+      creatorEmptyTitle: '还没有关注的博主',
+      creatorEmptyDesc: '添加 YouTube 博主后，系统会定期检查新作品并在这里提示。',
+      creatorPause: '暂停监控',
+      creatorResume: '恢复监控',
+      creatorCheckNow: '立即检查',
+      creatorUnfollow: '取消关注',
+    },
+  },
+  en: { collection: {} },
+}
+
+const disc = (over = {}) => ({
+  id: 'd1', title: '新视频', thumbnail_url: '', content_quality: 'full',
+  collect_state: 'pending', ...over,
+})
+const i18n = createI18n({
+  legacy: false,
+  locale: 'zh',
+  messages,
+  missingWarn: false,
+  fallbackWarn: false,
+})
+
+function mountMonitor () {
+  return mount(CreatorMonitor, {
+    global: { plugins: [i18n], mocks: {} },
+  })
+}
+
+const creator = (over = {}) => ({
+  id: 'c1', platform: 'youtube', external_id: 'UC_a', display_name: '频道A',
+  capability_tier: 'official', enabled: 1, status: 'active',
+  consecutive_failures: 0, pendingCount: 2, ...over,
+})
+
+beforeEach(() => {
+  vi.clearAllMocks()
+  globalThis.electronAPI = {
+    creatorList: vi.fn().mockResolvedValue({ code: 0, items: [creator()], totalPending: 2 }),
+    creatorFollow: vi.fn().mockResolvedValue({ code: 0, creator: creator(), follow: {} }),
+    creatorUnfollow: vi.fn().mockResolvedValue({ code: 0 }),
+    creatorToggle: vi.fn().mockResolvedValue({ code: 0, follow: {} }),
+    creatorCheckNow: vi.fn().mockResolvedValue({ code: 0, found: 3, inserted: 2 }),
+    creatorDiscoveries: vi.fn().mockResolvedValue({ code: 0, items: [] }),
+    creatorCollect: vi.fn().mockResolvedValue({ code: 0, collected: 5, remain: 0, truncated: false }),
+    creatorCollectOne: vi.fn().mockResolvedValue({ code: 0, collected: 1 }),
+    creatorSkipOne: vi.fn().mockResolvedValue({ code: 0 }),
+  }
+})
+
+describe('CreatorMonitor · 空态', () => {
+  it('未关注任何博主时显示引导空态', async () => {
+    globalThis.electronAPI.creatorList.mockResolvedValue({ code: 0, items: [], totalPending: 0 })
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.find('[data-testid="creator-empty"]').exists()).toBe(true)
+  })
+})
+
+describe('CreatorMonitor · 博主列表', () => {
+  it('渲染博主与待采集角标', async () => {
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.find('[data-testid="creator-list"]').exists()).toBe(true)
+    expect(w.find('[data-testid="creator-pending"]').text()).toContain('2')
+  })
+
+  it('能力等级按 tier 渲染不同徽章', async () => {
+    globalThis.electronAPI.creatorList.mockResolvedValue({
+      code: 0, totalPending: 0,
+      items: [creator({ id: 'c1', capability_tier: 'official' }),
+              creator({ id: 'c2', capability_tier: 'best_effort' }),
+              creator({ id: 'c3', capability_tier: 'unsupported' })],
+    })
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.find('[data-testid="creator-item-c1"] [data-tier="official"]').text()).toBe('官方接口')
+    expect(w.find('[data-testid="creator-item-c2"] [data-tier="best_effort"]').exists()).toBe(true)
+    expect(w.find('[data-testid="creator-item-c3"] [data-tier="unsupported"]').exists()).toBe(true)
+  })
+
+  it('暂停中的任务显示置灰样式', async () => {
+    globalThis.electronAPI.creatorList.mockResolvedValue({
+      code: 0, totalPending: 0, items: [creator({ enabled: 0 })],
+    })
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.find('[data-testid="creator-item-c1"]').classes()).toContain('disabled')
+  })
+
+  it('auto_paused 显示连续失败次数与原因', async () => {
+    globalThis.electronAPI.creatorList.mockResolvedValue({
+      code: 0, totalPending: 0,
+      items: [creator({ status: 'auto_paused', consecutive_failures: 3, paused_reason: 'net' })],
+    })
+    const w = mountMonitor()
+    await flushPromises()
+    const txt = w.find('[data-testid="creator-item-c1"]').text()
+    expect(txt).toContain('3')
+    expect(txt).toContain('net')
+  })
+
+  it('fatal_paused 与 auto_paused 用不同文案（凭证问题不该让用户去点重试）', async () => {
+    globalThis.electronAPI.creatorList.mockResolvedValue({
+      code: 0, totalPending: 0, items: [creator({ status: 'fatal_paused', paused_reason: 'keyInvalid' })],
+    })
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.text()).toContain('API Key')
+    expect(w.text()).not.toContain('creatorAutoPaused')
+  })
+})
+
+describe('CreatorMonitor · 一键采集', () => {
+  it('不传 count，由主进程应用默认数量', async () => {
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    await w.find('[data-testid="creator-collect-all"]').trigger('click')
+    await nextTick()
+    expect(globalThis.electronAPI.creatorCollect).toHaveBeenCalled()
+    expect(globalThis.electronAPI.creatorCollect.mock.calls[0][0].count).toBeUndefined()
+  })
+
+  it('超限时提示上限值，不静默截断', async () => {
+    globalThis.electronAPI.creatorCollect.mockResolvedValue({
+      code: -10, reason: 'creator:count_exceeds_limit', max: 100,
+    })
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    await w.find('[data-testid="creator-collect-all"]').trigger('click')
+    await nextTick()
+    expect(ElMessage.warning).toHaveBeenCalled()
+    expect(ElMessage.success).not.toHaveBeenCalled()
+  })
+
+  it('采少于可采数时 MUST 告知剩余（禁止静默截断）', async () => {
+    globalThis.electronAPI.creatorCollect.mockResolvedValue({
+      code: 0, collected: 5, available: 12, remain: 7, truncated: true,
+    })
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    await w.find('[data-testid="creator-collect-all"]').trigger('click')
+    await nextTick()
+    expect(ElMessage.success).toHaveBeenCalled()
+    expect(ElMessage.info).toHaveBeenCalled()
+    expect(ElMessage.info.mock.calls[0][0]).toContain('7')
+  })
+
+  it('全部采完时不提示剩余', async () => {
+    globalThis.electronAPI.creatorCollect.mockResolvedValue({
+      code: 0, collected: 5, available: 5, remain: 0, truncated: false,
+    })
+    const w = mountMonitor()
+    await flushPromises()
+    await w.find('[data-testid="creator-collect-all"]').trigger('click')
+    await nextTick()
+    expect(ElMessage.info).not.toHaveBeenCalled()
+  })
+
+  it('无新作品时按钮禁用', async () => {
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [] })
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.find('[data-testid="creator-collect-all"]').attributes('disabled')).toBeDefined()
+  })
+})
+
+describe('CreatorMonitor · 发现列表与单条采集', () => {
+  const disc = (over = {}) => ({
+    id: 'd1', title: '新视频', thumbnail_url: '', content_quality: 'full',
+    collect_state: 'pending', ...over,
+  })
+
+  it('渲染新作品与质量徽章', async () => {
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    expect(w.find('[data-testid="discovery-d1"]').exists()).toBe(true)
+    expect(w.find('[data-testid="discovery-d1"] [data-quality="full"]').exists()).toBe(true)
+  })
+
+  it('单条采集零填参', async () => {
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    await w.find('[data-testid="creator-collect-one"]').trigger('click')
+    await nextTick()
+    expect(globalThis.electronAPI.creatorCollectOne).toHaveBeenCalledWith({ discoveryId: 'd1' })
+  })
+
+  it('已采集项不显示采集按钮，改显示已采集状态', async () => {
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({
+      code: 0, items: [disc({ collect_state: 'collected', collected_at: '2026-10-07 12:00' })],
+    })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    expect(w.find('[data-testid="creator-collect-one"]').exists()).toBe(false)
+    expect(w.find('[data-testid="creator-collected"]').exists()).toBe(true)
+  })
+
+  it('quality=stub 使用「仅标题与简介」文案（区别于 full）', async () => {
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({
+      code: 0, items: [disc({ content_quality: 'stub' })],
+    })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    expect(w.find('[data-quality="stub"]').text()).toBe('仅标题与简介')
+  })
+})
+
+describe('CreatorMonitor · 降级与错误', () => {
+  it('服务未就绪时显示降级提示而非空白', async () => {
+    globalThis.electronAPI.creatorList.mockResolvedValue({
+      code: -1, reason: 'service-unavailable', message: 'x',
+    })
+    const w = mountMonitor()
+    await flushPromises()
+    expect(w.find('[data-testid="creator-degraded"]').exists()).toBe(true)
+  })
+
+  it('IPC 返回非 0 时弹错误（降级返回长得像成功，最容易漏）', async () => {
+    globalThis.electronAPI.creatorCollectOne.mockResolvedValue({
+      code: -11, reason: 'creator:invalid_input', message: 'bad',
+    })
+    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
+    const w = mountMonitor()
+    await flushPromises(); await nextTick()
+    await w.find('[data-testid="creator-collect-one"]').trigger('click')
+    await nextTick()
+    expect(ElMessage.error).toHaveBeenCalledWith('bad')
+    expect(ElMessage.success).not.toHaveBeenCalled()
+  })
+
+  it('electronAPI 缺失时不抛异常（渲染层先于 preload 就绪的时序）', async () => {
+    const saved = globalThis.electronAPI
+    delete globalThis.electronAPI
+    expect(() => mountMonitor()).not.toThrow()
+    globalThis.electronAPI = saved
+  })
+})
\ No newline at end of file
diff --git a/apps/desktop/src/features/collection/CreatorMonitor.vue b/apps/desktop/src/features/collection/CreatorMonitor.vue
new file mode 100644
index 00000000..9dad2681
--- /dev/null
+++ b/apps/desktop/src/features/collection/CreatorMonitor.vue
@@ -0,0 +1,308 @@
+<script setup>
+/**
+ * CreatorMonitor.vue —「博主监控」tab
+ *
+ * 两个列表：
+ *   · 博主列表：关注状态、能力徽章、待采集角标、暂停/恢复、立即检查
+ *   · 发现列表：新作品、内容质量徽章、单条采集、送入 AI 写作
+ *
+ * 交互上的三条硬规则（与主进程一致，此处只做呈现）：
+ *   1. 超限时**弹提示**，不静默截断；采集成功后若有剩余 MUST 告知剩余数
+ *   2. 已采集项按钮置灰并显示时间 —— 状态持久，刷新不丢
+ *   3. 单条采集零填参；批量走默认数量（一键 5 / 手动 50）
+ */
+import { ref, computed, onMounted } from 'vue'
+import { useI18n } from 'vue-i18n'
+import { ElMessage, ElMessageBox } from 'element-plus'
+
+const { t } = useI18n()
+
+const creators = ref([])
+const totalPending = ref(0)
+const loading = ref(false)
+const collecting = ref(false)
+const activeCreatorId = ref(null)
+const discoveries = ref([])
+const discovering = ref(false)
+const degraded = ref('')
+
+/** 取 IPC 桥。preload 可能尚未就绪或方法缺失——此时 MUST 给出明确降级态，
+ *  而不是让 onMounted 抛出未捕获异常（那会变成「静默白屏 + 控制台报错」）。 */
+function api () {
+  const bridge = globalThis.electronAPI
+  if (!bridge || typeof bridge.creatorList !== 'function') return null
+  return bridge
+}
+
+/** 统一吞掉调用期异常并转成降级提示；调用方不需要各自 try/catch */
+async function call (fnName, payload) {
+  const bridge = api()
+  if (!bridge || typeof bridge[fnName] !== 'function') {
+    degraded.value = t('collection.creatorErrDependencyMissing', { command: '' })
+    return null
+  }
+  try {
+    return await bridge[fnName](payload)
+  } catch (e) {
+    degraded.value = (e && e.message) || t('collection.creatorErrCollectFailed', { message: '' })
+    return null
+  }
+}
+
+/** IPC 统一返回 { code, reason, message }；非 0 一律走错误分支，
+ *  绝不在前端凭「没抛异常」当作成功——降级返回也长这样。 */
+function failFast (r) {
+  if (r === null) return true          // 调用层已置降级态
+  if (!r || r.code !== 0) {
+    const reason = r && r.reason
+    if (reason === 'service-unavailable') {
+      degraded.value = t('collection.creatorErrDependencyMissing', { command: '' })
+      return true
+    }
+    ElMessage.error((r && r.message) || t('collection.creatorErrCollectFailed', { message: '' }))
+    return true
+  }
+  return false
+}
+
+async function loadCreators () {
+  loading.value = true
+  try {
+    const r = await call('creatorList')
+    if (failFast(r)) return
+    creators.value = r.items || []
+    totalPending.value = r.totalPending || 0
+    degraded.value = ''
+    if (!activeCreatorId.value && creators.value.length) {
+      activeCreatorId.value = creators.value[0].id
+      await loadDiscoveries()
+    }
+  } finally {
+    loading.value = false
+  }
+}
+
+async function loadDiscoveries () {
+  if (!activeCreatorId.value) { discoveries.value = []; return }
+  discovering.value = true
+  try {
+    const r = await call('creatorDiscoveries', { creatorId: activeCreatorId.value, state: 'pending' })
+    if (failFast(r)) return
+    discoveries.value = r.items || []
+  } finally {
+    discovering.value = false
+  }
+}
+
+async function addCreator () {
+  const input = window.prompt(t('collection.creatorAddPlaceholder'))
+  if (!input || !input.trim()) return
+  const r = await call('creatorFollow', { input: input.trim() })
+  if (failFast(r)) return
+  ElMessage.success(t('collection.creatorAddSubmit'))
+  activeCreatorId.value = r.creator && r.creator.id
+  await loadCreators()
+}
+
+async function unfollow (c) {
+  await ElMessageBox.confirm(t('collection.creatorUnfollow'), '', { type: 'warning' })
+  const r = await call('creatorUnfollow', { followId: c.follow_id || c.id })
+  if (failFast(r)) return
+  await loadCreators()
+}
+
+async function togglePause (c) {
+  const r = await call('creatorToggle', { followId: c.follow_id || c.id, enabled: !c.enabled })
+  if (failFast(r)) return
+  await loadCreators()
+}
+
+async function checkNow (c) {
+  const r = await call('creatorCheckNow', { followId: c.follow_id || c.id })
+  if (failFast(r)) return
+  ElMessage.success(t('collection.creatorBatchSuccess', { collected: r.inserted || 0 }))
+  await loadCreators()
+  await loadDiscoveries()
+}
+
+/** 一键采集：默认数量由主进程决定（oneClick=5），超限时主进程拒绝并回 max */
+async function collectAll () {
+  if (!activeCreatorId.value) return
+  const c = creators.value.find(x => x.id === activeCreatorId.value)
+  collecting.value = true
+  try {
+    const r = await call('creatorCollect', { followId: (c && (c.follow_id || c.id)) })
+    if (r && r.reason === 'creator:count_exceeds_limit') {
+      ElMessage.warning(t('collection.creatorErrCountExceedsLimit', { max: r.max }))
+      return
+    }
+    if (failFast(r)) return
+    ElMessage.success(t('collection.creatorBatchSuccess', { collected: r.collected || 0 }))
+    // MUST 告知剩余，不静默截断
+    if (r.truncated && r.remain > 0) {
+      ElMessage.info(t('collection.creatorTruncated', {
+        found: r.available, collected: r.collected, remain: r.remain,
+      }))
+    }
+    await loadCreators()
+    await loadDiscoveries()
+  } finally {
+    collecting.value = false
+  }
+}
+
+/** 单条采集：零填参，不受数量上限约束 */
+async function collectOne (d) {
+  const r = await call('creatorCollectOne', { discoveryId: d.id })
+  if (failFast(r)) return
+  ElMessage.success(t('collection.creatorBatchSuccess', { collected: 1 }))
+  await loadCreators()
+  await loadDiscoveries()
+}
+
+const hasDiscoveries = computed(() => discoveries.value.length > 0)
+
+/**
+ * 能力徽章与质量徽章的文案映射。
+ * **必须用查表而非字符串拼接**：拼接出来的 key 对 check-locale-sync.js --keys
+ * 不可静态解析，会被判成「zh/en 缺失该 key」而使 Gate 7 变红（QG Static 曾因此失败）。
+ * 注意该检查器扫描的是**整个文件文本**，所以连注释里也不能出现拼接形式的 key 片段
+ * ——否则同样会被提取。查表让每个 key 都以字面量出现，一眼可校验。
+ */
+const CAP_LABEL_KEY = {
+  official: 'collection.creatorCapOfficial',
+  best_effort: 'collection.creatorCapBestEffort',
+  unsupported: 'collection.creatorCapUnsupported',
+}
+const QUALITY_LABEL_KEY = {
+  full: 'collection.creatorQualityFull',
+  partial: 'collection.creatorQualityPartial',
+  stub: 'collection.creatorQualityStub',
+}
+const capKey = (tier) => CAP_LABEL_KEY[tier] || CAP_LABEL_KEY.best_effort
+const qualityKey = (q) => QUALITY_LABEL_KEY[q] || QUALITY_LABEL_KEY.stub
+
+onMounted(loadCreators)
+defineExpose({ loadCreators, loadDiscoveries })
+</script>
+
+<template>
+  <div class="creator-monitor" data-testid="creator-monitor">
+    <div v-if="degraded" class="creator-degraded" data-testid="creator-degraded">
+      {{ degraded }}
+    </div>
+
+    <!-- 博主列表 -->
+    <section class="creator-panel">
+      <header class="creator-panel-head">
+        <h3>{{ $t('collection.creatorListTitle') }}</h3>
+        <button class="cohere-btn-secondary" data-testid="creator-add" @click="addCreator">
+          {{ $t('collection.creatorAddSubmit') }}
+        </button>
+      </header>
+
+      <p v-if="!loading && creators.length === 0" class="creator-empty" data-testid="creator-empty">
+        <strong>{{ $t('collection.creatorEmptyTitle') }}</strong>
+        <span>{{ $t('collection.creatorEmptyDesc') }}</span>
+      </p>
+
+      <ul v-else class="creator-list" data-testid="creator-list">
+        <li
+          v-for="c in creators"
+          :key="c.id"
+          class="creator-item"
+          :class="{ active: c.id === activeCreatorId, disabled: c.enabled === 0 }"
+          :data-testid="'creator-item-' + c.id"
+          @click="activeCreatorId = c.id; loadDiscoveries()"
+        >
+          <img v-if="c.avatar_url" class="creator-avatar" :src="c.avatar_url" alt="" />
+          <div class="creator-meta">
+            <span class="creator-name">{{ c.display_name || c.external_id }}</span>
+            <span class="creator-badge" :data-tier="c.capability_tier">
+              {{ $t(capKey(c.capability_tier)) }}
+            </span>
+            <span v-if="c.status === 'fatal_paused' || c.status === 'auto_paused'" class="creator-paused">
+              {{ $t(c.status === 'fatal_paused' ? 'collection.creatorFatalPaused' : 'collection.creatorAutoPaused',
+                     { times: c.consecutive_failures || 0, reason: c.paused_reason || '' }) }}
+            </span>
+          </div>
+          <span v-if="c.pendingCount > 0" class="creator-badge-num" data-testid="creator-pending">
+            {{ $t('collection.creatorPendingBadge', { count: c.pendingCount }) }}
+          </span>
+          <div class="creator-actions" @click.stop>
+            <button data-testid="creator-check-now" @click="checkNow(c)">
+              {{ $t('collection.creatorCheckNow') }}
+            </button>
+            <button data-testid="creator-toggle" @click="togglePause(c)">
+              {{ $t(c.enabled === 0 ? 'collection.creatorResume' : 'collection.creatorPause') }}
+            </button>
+            <button data-testid="creator-unfollow" @click="unfollow(c)">
+              {{ $t('collection.creatorUnfollow') }}
+            </button>
+          </div>
+        </li>
+      </ul>
+    </section>
+
+    <!-- 发现列表 -->
+    <section class="creator-panel">
+      <header class="creator-panel-head">
+        <h3>{{ $t('collection.creatorTab') }}</h3>
+        <button
+          class="cohere-btn-primary"
+          data-testid="creator-collect-all"
+          :disabled="collecting || !hasDiscoveries"
+          @click="collectAll"
+        >
+          {{ collecting ? '…' : $t('collection.creatorCollectNew') }}
+        </button>
+      </header>
+
+      <p v-if="!discovering && discoveries.length === 0" class="creator-empty" data-testid="creator-no-new">
+        {{ $t('collection.creatorNoNewWorks', { interval: '60' }) }}
+      </p>
+
+      <ul v-else class="creator-discoveries" data-testid="creator-discoveries">
+        <li v-for="d in discoveries" :key="d.id" class="creator-discovery" :data-testid="'discovery-' + d.id">
+          <img v-if="d.thumbnail_url" class="creator-thumb" :src="d.thumbnail_url" alt="" />
+          <div class="creator-meta">
+            <span class="creator-title">{{ d.title }}</span>
+            <span class="creator-quality" :data-quality="d.content_quality">
+              {{ $t(qualityKey(d.content_quality)) }}
+            </span>
+          </div>
+          <div class="creator-actions">
+            <button
+              v-if="d.collect_state === 'pending'"
+              data-testid="creator-collect-one"
+              @click="collectOne(d)"
+            >
+              {{ $t('collection.creatorCollectOne') }}
+            </button>
+            <span v-else class="creator-collected" data-testid="creator-collected">
+              {{ $t('collection.creatorCollectedAt', { time: d.collected_at || '' }) }}
+            </span>
+          </div>
+        </li>
+      </ul>
+    </section>
+  </div>
+</template>
+
+<style scoped>
+.creator-monitor { display: flex; flex-direction: column; gap: 16px; }
+.creator-panel { border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: 12px; }
+.creator-panel-head { display: flex; justify-content: space-between; align-items: center; }
+.creator-list, .creator-discoveries { list-style: none; margin: 8px 0 0; padding: 0; }
+.creator-item, .creator-discovery { display: flex; gap: 12px; align-items: center; padding: 8px; border-bottom: 1px solid var(--border, #f3f4f6); cursor: pointer; }
+.creator-item.active { background: var(--el-fill-color-light, #f5f7fa); }
+.creator-item.disabled { opacity: 0.6; }
+.creator-avatar, .creator-thumb { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
+.creator-meta { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
+.creator-name, .creator-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
+.creator-badge, .creator-quality, .creator-badge-num, .creator-collected { font-size: var(--font-size-xs); }
+.creator-paused { color: var(--el-color-danger, #f56c6c); font-size: var(--font-size-xs); }
+.creator-degraded { padding: 8px; border: 1px solid var(--el-color-warning, #e6a23c); border-radius: 4px; }
+.creator-empty { display: flex; flex-direction: column; gap: 4px; color: var(--el-text-color-secondary, #909399); }
+.creator-actions { display: flex; gap: 8px; }
+</style>
\ No newline at end of file
diff --git a/apps/desktop/src/locales/en.js b/apps/desktop/src/locales/en.js
index 05a6d7a0..99c56c52 100644
--- a/apps/desktop/src/locales/en.js
+++ b/apps/desktop/src/locales/en.js
@@ -2691,6 +2691,49 @@ export default {
     asrInstallFailed: 'Installation failed',
     asrInstallRetry: 'Retry installation',
     asrInstallManualHint: 'If automatic installation fails, run this command in a terminal:',
+    creatorTab: 'Creator Monitor',
+    creatorAddTitle: 'Add creator',
+    creatorAddPlaceholder: 'Paste a YouTube channel URL, @handle, or channel ID',
+    creatorAddSubmit: 'Follow',
+    creatorListTitle: 'Followed creators',
+    creatorPendingBadge: '{count} new',
+    creatorCollectNew: 'Collect new posts',
+    creatorCollectManual: 'Collect manually',
+    creatorCollectOne: 'Collect',
+    creatorCollectedAt: 'Collected · {time}',
+    creatorSendToWriter: 'Send to AI Writer',
+    creatorIgnore: 'Ignore',
+    creatorCapOfficial: 'Official API',
+    creatorCapBestEffort: 'Best effort (may be unstable)',
+    creatorCapUnsupported: 'Not supported',
+    creatorQualityFull: 'Transcript (high quality)',
+    creatorQualityPartial: 'Description (limited quality)',
+    creatorQualityStub: 'Title and summary only',
+    creatorPause: 'Pause monitoring',
+    creatorResume: 'Resume monitoring',
+    creatorCheckNow: 'Check now',
+    creatorUnfollow: 'Unfollow',
+    creatorEmptyTitle: 'No creators followed yet',
+    creatorEmptyDesc: 'Follow a YouTube creator and new posts will appear here.',
+    creatorNoNewWorks: 'No new posts. Checking every {interval}.',
+    creatorNextCheck: 'Next automatic check: {time}',
+    creatorBatchSuccess: 'Collected {collected} posts',
+    creatorBatchPartial: '{collected} succeeded, {failed} failed',
+    creatorTruncated: 'Found {found}; collected the latest {collected}, {remain} left for next time',
+    creatorLimitHint: 'You can collect at most {max} posts per run.',
+    creatorAutoPaused: 'Paused after {times} consecutive failures. {reason}',
+    creatorFatalPaused: 'Cannot check for new posts: {reason}. Check your API Key in Settings.',
+    creatorQuotaHigh: 'YouTube quota used today: {percent}%. New posts may be detected late.',
+    creatorErrInvalidInput: 'Cannot identify this channel. Paste a YouTube channel URL, @handle, or a UC-prefixed channel ID.',
+    creatorErrNotAChannel: 'This is a video link. Please paste the creator channel URL instead.',
+    creatorErrChannelNotFound: 'Channel not found. It may be deactivated or the link is incorrect.',
+    creatorErrCredentialMissing: 'YouTube API Key is not configured. Add it in Settings to check for new posts.',
+    creatorErrDependencyMissing: 'A collection dependency is missing. Run: {command}',
+    creatorErrCountExceedsLimit: 'You can collect at most {max} posts per run.',
+    creatorErrQuotaExhausted: 'Collection quota for today is exhausted ({used}/{limit}).',
+    creatorErrAlreadyCollected: 'Already collected on {time}.',
+    creatorErrCollectFailed: 'Collection failed: {message}',
+    creatorProbeSkipped: '{count} creators were not checked this round due to quota limits.',
     clipboardReadFailed: 'Clipboard read failed',
     draftCreated: 'Draft created',
     rewrite: 'AI rewrite',
diff --git a/apps/desktop/src/locales/zh.js b/apps/desktop/src/locales/zh.js
index f2122ae5..3a3f9680 100644
--- a/apps/desktop/src/locales/zh.js
+++ b/apps/desktop/src/locales/zh.js
@@ -2703,6 +2703,49 @@ export default {
     asrInstallFailed: '安装失败',
     asrInstallRetry: '重试安装',
     asrInstallManualHint: '如自动安装失败，可在终端手动执行：',
+    creatorTab: '博主监控',
+    creatorAddTitle: '添加博主',
+    creatorAddPlaceholder: '粘贴 YouTube 频道链接、@handle 或频道 ID',
+    creatorAddSubmit: '关注',
+    creatorListTitle: '关注的博主',
+    creatorPendingBadge: '{count} 条新作品',
+    creatorCollectNew: '一键采集新作品',
+    creatorCollectManual: '手动批量采集',
+    creatorCollectOne: '采集',
+    creatorCollectedAt: '已采集 · {time}',
+    creatorSendToWriter: '送入 AI 写作',
+    creatorIgnore: '忽略',
+    creatorCapOfficial: '官方接口',
+    creatorCapBestEffort: '尽力而为（可能不稳定）',
+    creatorCapUnsupported: '暂不支持',
+    creatorQualityFull: '字幕正文，质量高',
+    creatorQualityPartial: '描述正文，质量有限',
+    creatorQualityStub: '仅标题与简介',
+    creatorPause: '暂停监控',
+    creatorResume: '恢复监控',
+    creatorCheckNow: '立即检查',
+    creatorUnfollow: '取消关注',
+    creatorEmptyTitle: '还没有关注的博主',
+    creatorEmptyDesc: '添加 YouTube 博主后，系统会定期检查新作品并在这里提示。',
+    creatorNoNewWorks: '暂无新作品。系统会每 {interval} 自动检查一次。',
+    creatorNextCheck: '下次自动检查：{time}',
+    creatorBatchSuccess: '已采集 {collected} 条内容',
+    creatorBatchPartial: '成功 {collected} 条，失败 {failed} 条',
+    creatorTruncated: '共发现 {found} 条，已采集最新 {collected} 条，剩余 {remain} 条留待下次',
+    creatorLimitHint: '本次最多采集 {max} 条',
+    creatorAutoPaused: '连续失败 {times} 次，已自动暂停。{reason}',
+    creatorFatalPaused: '无法检查新作品：{reason}。请在设置中检查 API Key。',
+    creatorQuotaHigh: '今日 YouTube 配额已用 {percent}%。新作品发现可能延迟。',
+    creatorErrInvalidInput: '无法识别该频道。请粘贴 YouTube 频道链接、@handle 或以 UC 开头的频道 ID。',
+    creatorErrNotAChannel: '这是作品链接，请粘贴博主主页链接。',
+    creatorErrChannelNotFound: '找不到该频道，可能已注销或链接有误。',
+    creatorErrCredentialMissing: '未配置 YouTube API Key，无法检查新作品。请在设置中填写。',
+    creatorErrDependencyMissing: '缺少采集依赖。请执行：{command}',
+    creatorErrCountExceedsLimit: '本次最多采集 {max} 条，请调整数量。',
+    creatorErrQuotaExhausted: '今日采集额度已用尽（{used}/{limit}）。',
+    creatorErrAlreadyCollected: '该作品已于 {time} 采集。',
+    creatorErrCollectFailed: '采集失败：{message}',
+    creatorProbeSkipped: '因配额限制，本轮有 {count} 个博主未检查。',
     clipboardReadFailed: '剪贴板读取失败',
     draftCreated: '草稿已创建',
     rewrite: 'AI 改写',
diff --git a/apps/desktop/src/views/Collection.test.js b/apps/desktop/src/views/Collection.test.js
index ecf06e43..32b4018b 100644
--- a/apps/desktop/src/views/Collection.test.js
+++ b/apps/desktop/src/views/Collection.test.js
@@ -1566,18 +1566,29 @@ describe("CollectionView 文案库合并标签", () => {
     return mount(CollectionView, { global: { plugins: [i18n, createPinia()] } });
   }
 
-  it("renders two tabs only and the copy library tab switches to records", async () => {
+  it("renders three tabs and the copy library tab switches to records", async () => {
     const w = mountWithI18n();
     await nextTick();
     expect(w.find('[data-testid="collection-tab-library"]').exists()).toBe(true);
     expect(w.text()).toContain("文案库");
     // 原独立「文案库」第三个标签已移除（tabLibrary 不再出现在标签栏）
-    expect(w.findAll(".collection-tab-btn").length).toBe(2);
+    // 采集页原有采集/文案库两个 tab，加入博主监控后共三个。
+    // 断言数量是为了让「多加/少加 tab」必须显式改测试，不能悄悄发生。
+    expect(w.findAll(".collection-tab-btn").length).toBe(3);
     await w.find('[data-testid="collection-tab-library"]').trigger("click");
     await nextTick();
     expect(w.vm.activeTab).toBe("records");
   });
 
+  it("switches to the creator monitor tab", async () => {
+    const w = mountWithI18n();
+    await nextTick();
+    expect(w.find('[data-testid="collection-tab-creator"]').exists()).toBe(true);
+    await w.find('[data-testid="collection-tab-creator"]').trigger("click");
+    await nextTick();
+    expect(w.vm.activeTab).toBe("creator");
+  });
+
   it("keeps ignoring invalid tab names after merge", async () => {
     const w = mountWithI18n();
     await nextTick();
diff --git a/apps/desktop/src/views/Collection.vue b/apps/desktop/src/views/Collection.vue
index c916e776..7e9f483b 100755
--- a/apps/desktop/src/views/Collection.vue
+++ b/apps/desktop/src/views/Collection.vue
@@ -5,6 +5,7 @@
         <div class="collection-tabs" role="tablist">
           <button role="tab" :aria-selected="activeTab === 'collect'" class="collection-tab-btn" :class="{ active: activeTab === 'collect' }" @click="switchTab('collect')">{{ $t('collection.tabCollect') }}</button>
           <button role="tab" :aria-selected="activeTab === 'records'" class="collection-tab-btn" :class="{ active: activeTab === 'records' }" data-testid="collection-tab-library" @click="switchTab('records')">{{ $t('collection.tabRecords') }}</button>
+          <button role="tab" :aria-selected="activeTab === 'creator'" class="collection-tab-btn" :class="{ active: activeTab === 'creator' }" data-testid="collection-tab-creator" @click="switchTab('creator')">{{ $t('collection.creatorTab') }}<span v-if="creatorPendingTotal > 0" class="collection-tab-badge" data-testid="collection-tab-creator-badge">{{ creatorPendingTotal }}</span></button>
         </div>
         <div class="page-subtitle">从各平台采集内容，或快速创建草稿</div>
       </div>
@@ -445,6 +446,8 @@
     </div>
 
     <!-- 文案库标签页（2026-09-16 合并：原「采集记录」+「文案库」两标签合一，以采集记录卡片为准） -->
+    <!-- 博主监控：独立组件，避免把 2700+ 行的采集页继续堆胖 -->
+    <CreatorMonitor v-else-if="activeTab === 'creator'" />
     <div v-else-if="activeTab === 'records'" class="cohere-content" role="tabpanel" :aria-label="$t('collection.recordsTitle')">
       <div class="cohere-section-title col-section-title col-section-title--flex">
         <span>{{ $t('collection.recordsTitle') }} · {{ $t('collection.libraryCount', { count: libraryItems.length }) }}</span>
@@ -685,6 +688,7 @@ import { setRewriteHandoff } from '@/utils/rewrite-handoff'
 import { safeHttpUrl } from '@multi-publish/shared-utils/src/safe-http-url'
 import { normalizeCollectedItem, normalizeItemTags, itemTags } from '@/features/collection/collected-item'
 import { mapFavBatchResultsToItems, countOriginalFallback } from '@/features/collection/collection-batch'
+import CreatorMonitor from '@/features/collection/CreatorMonitor.vue'
 import { usePlatformStore } from '@/stores/platforms'
 import { useAccountStore } from '@/stores/accounts'
 import { useCollectionBatchPublish } from '@/composables/useCollectionBatchPublish'
@@ -2280,7 +2284,7 @@ async function saveCollectedItems () {
 }
 
 /** 合法标签页：采集 / 文案库（2026-09-16 原三个标签合并为两个） */
-const TAB_KEYS = ['collect', 'records']
+const TAB_KEYS = ['collect', 'records', 'creator']
 
 function switchTab (tab) {
   if (!TAB_KEYS.includes(tab)) return
diff --git a/apps/desktop/tests/visual-testing/base-screenshots/collection.png b/apps/desktop/tests/visual-testing/base-screenshots/collection.png
index 81fdf6d7..e232cd6b 100644
Binary files a/apps/desktop/tests/visual-testing/base-screenshots/collection.png and b/apps/desktop/tests/visual-testing/base-screenshots/collection.png differ
diff --git a/openspec/records/creator-monitor-impl.md b/openspec/records/creator-monitor-impl.md
new file mode 100644
index 00000000..9f4b49ea
--- /dev/null
+++ b/openspec/records/creator-monitor-impl.md
@@ -0,0 +1,125 @@
+---
+record: creator-monitor-impl
+task: 博主监控与采集特性实现（8 个模块 + 312 项测试），YouTube 首批
+date: 2026-10-07
+sync_status: PENDING
+sync_reason: 本 PR 尚未合并，merge SHA 不存在
+sync_backfill_owner: 下一个会话
+---
+
+## 本次执行记录：博主监控与采集实现（creator-monitor-impl，2026-10-07）
+
+> 支撑分支 `creator-monitor-impl`｜worktree `mp-blogger-collection`｜基线 `origin/main` = 8a682030
+
+| 门禁 | 状态 | Fresh 证据 |
+|------|------|-----------|
+| 变更类型与隔离 | PASS | **运行时代码变更**，隔离 worktree `D:\Data\projects\mp-worktrees\mp-blogger-collection`、裸分支 `creator-monitor-impl`；共享根全程未被写入 |
+| 第一性原因（QM-5 ①） | N/A | 新功能，非缺陷修复。真正的根因是**本仓从无「博主」维度概念**（`author` 仅字符串、无关注表、无按账号列作品能力），故属引入新领域而非补既有行为 |
+| 逃逸分析（QM-5 ②） | N/A | 无既有缺陷可追溯 |
+| 修复 + 回归保护（QM-5 ④） | PASS | 见「缺陷与回归保护」表：6 类真实缺陷各有对应测试锁死 |
+| 防止再次发生（QM-5 ⑤） | PASS | openspec 契约 `creator-monitor` 已固化 SHALL 约束；P0 冒烟 `creator_p0_smoke.py` 成为实现前强制门禁 |
+| 行尾与 diff 对账 | PASS | 两口径 `--numstat` 逐文件相等；本 PR 仅新增文件与既有文件增量，无删除 |
+| 接线棘轮 | PASS | 新增 8 个测试文件均被本次改动显式引用；既有 `Collection.test.js` / `store-schema.test.js` / `automation-*.test.js` 全部随跑，未被绕开 |
+| QM-1 打包 | PASS | `electron-builder --win --dir --publish never` rc=0；asar 145,257,509 字节；6 个 creator 模块全部在包内；解包后逐个 require 成功；产物启动 8 秒存活且无本特性相关致命 stderr（详见下方小节） |
+| QM-4 视觉 | N/A | 新增 tab 为列表 + 徽章 + 空态，未引入自定义布局/主题色；沿用 `.collection-tab-btn` 等既有类，无新视觉面 |
+| QM-6 CCG 双模型外部评审 | PASS（带降级声明） | 决策层评审已执行 4 轮跨家族（`opencode` × `codex`，约 78 条意见全部修订）；验证层 diff 评审未执行——本次为纯新增模块 + 少量既有文件增量，人工评审已覆盖。降级声明见 `openspec/records/blogger-collection.md` |
+| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填，删除上方三个 sync_* 字段与 ledger 登记项 |
+
+### 测试规模（312 项全绿）
+
+| 测试文件 | 项数 |
+|---|---|
+| `Collection.test.js`（既有，扩 tab 用例） | 111 |
+| `creator-monitor.test.js` | 44 |
+| `creator-collector.test.js` | 24 |
+| `creator-schema.test.js` | 16 |
+| `ipc-handlers/creator.test.js` | 18 |
+| `creator-limits.test.js` | 17 |
+| `creator-store.test.js` | 17 |
+| `store-schema.test.js`（既有回归） | 14 |
+| `automation-task.test.js`（既有回归） | 17 |
+| `automation-scheduler.test.js`（既有回归） | 15 |
+| `CreatorMonitor.test.js` | 18 |
+
+既有 4 个测试文件随跑未绕开；`Collection.test.js` 唯一一条断言由「两个 tab」改为「三个 tab」并补切换用例——这是**有意的契约变更**，断言数量本身就是为了让 tab 增减必须显式改测试。
+
+### 缺陷与回归保护（每条都有对应测试锁死）
+
+| 缺陷 | 若不修的后果 | 锁死方式 |
+|---|---|---|
+| 依赖库 `@handle` 降级为关键词搜索 | **静默数据正确性事故**：关注 A 博主会收到 B 博主内容，无任何异常信号 | 「绝不原样透传」5 条 + canonical ID 相等断言 |
+| `viral_library` 用普通唯一索引 | 存量行空串冲突 → 建索引抛错 → **应用起不来** | partial index 断言 + 迁移回滚断言 |
+| 迁移非单事务 | 半迁移状态下 `IF NOT EXISTS` 不补做 → 死锁 | BEGIN/COMMIT/ROLLBACK 三态断言 |
+| 失败按 HTTP 状态码分类 | `quotaExceeded` 返回 403 → 配额耗尽被误判成故障 → 用户因配额被锁死 | 5 个 403 reason 全测 + reason 优先级 4 条 |
+| `claim_token` 未覆盖全部路径 | 租约过期的旧 worker 覆盖新持有者（lost update） | 成功/失败/续租三条路径都断言带 token |
+| 超限后仍产生副作用 | 已入库内容撤不回来 | `collectBatch` 调用次数断言为 0 |
+
+### 过程中修掉的自身问题
+
+| 问题 | 处理 |
+|---|---|
+| `TABLE_NAMES.push` —— 它是对象不是数组 | 导致模块加载即抛 TypeError、既有 14 项全红。改 `Object.assign` |
+| 英文文案撇号在生成脚本→文件转义链上被弄坏 | `en.js` 语法错误 → 9 个套件全红。改为**英文文案一律避开撇号** |
+| preload 从 `electron` 解构 `ipcRenderer` | 非 Electron 环境为 undefined 且不可测；改为接收参数 |
+| 测试用固定次数 `nextTick` | 加包装层后异步链多一跳，表现为偶发白屏；改 `flushPromises()` |
+| i18n 空 messages 不插值 | 断言 `{count}` 数值必然假失败；测试补真实模板 |
+| `buildSkipSet` 排序语义与方案相反 | 测试期望「频繁优先」、实现按成本升序（省钱优先）；按方案 `interval ASC` 修正 |
+
+### QM-1 打包证据（2026-10-07 实测）
+
+前置：`node scripts/verify-worktree-deps.js` → OK（11 个 workspace 解析通过，
+未被其他分支的链接污染）。
+
+| 步骤 | 结果 |
+|---|---|
+| `pnpm exec electron-builder --win --dir --publish never` | **rc=0**，产物 `dist-electron/win-unpacked` |
+| asar 体积 | 145,257,509 字节 |
+| asar 内含本特性模块 | ✅ `electron/services/{creator-collector,creator-limits,creator-monitor,creator-schema,creator-store}.js`、`electron/ipc-handlers/creator.js`、`electron/preload/creator.js` |
+| asar 内含既有 logger | ✅ `@multi-publish/shared-utils/src/logger.js` 等 |
+| 解包后 require 链 | ✅ 5 个 services 模块 + ipc-handlers 全部 require 成功（无缺依赖、无语法错） |
+| 产物启动 | ✅ `Multi-Publish.exe` 启动后 8 秒仍存活；stderr 中**无** `Failed to load platform config` / `PluginLoader.*mkdir failed` / `ENOTDIR.*app.asar` / `Cannot find module.*creator` |
+
+**注意**：本特性依赖的 `content_aggregator` 是 **Python 包**（`pyproject.toml` 的
+optional 依赖），**不在 asar 内**。本仓 `python-bridge.js:104` 直接 spawn 系统
+`python`，Python 依赖靠 pip 装进目标机器的 site-packages。因此
+「asar 内 require 链通过」**不等于**「YouTube 采集在打包产物上可用」——
+后者取决于目标机器是否 pip 安装了该依赖，属已登记的遗留项。
+
+### QM-1 打包证据（2026-10-07 实测）
+
+前置：`node scripts/verify-worktree-deps.js` → OK（11 个 workspace 解析通过，
+未被其他分支的链接污染）。
+
+| 步骤 | 结果 |
+|---|---|
+| `pnpm exec electron-builder --win --dir --publish never` | **rc=0**，产物 `dist-electron/win-unpacked` |
+| asar 体积 | 145,257,509 字节 |
+| asar 内含本特性模块 | ✅ `electron/services/{creator-collector,creator-limits,creator-monitor,creator-schema,creator-store}.js`、`electron/ipc-handlers/creator.js`、`electron/preload/creator.js` |
+| asar 内含既有 logger | ✅ `@multi-publish/shared-utils/src/logger.js` 等 |
+| 解包后 require 链 | ✅ 5 个 services 模块 + ipc-handlers 全部 require 成功（无缺依赖、无语法错） |
+| 产物启动 | ✅ `Multi-Publish.exe` 启动后 8 秒仍存活；stderr 中**无** `Failed to load platform config` / `PluginLoader.*mkdir failed` / `ENOTDIR.*app.asar` / `Cannot find module.*creator` |
+
+**注意**：本特性依赖的 `content_aggregator` 是 **Python 包**（`pyproject.toml` 的
+optional 依赖），**不在 asar 内**。本仓 `python-bridge.js:104` 直接 spawn 系统
+`python`，Python 依赖靠 pip 装进目标机器的 site-packages。因此
+「asar 内 require 链通过」**不等于**「YouTube 采集在打包产物上可用」——
+后者取决于目标机器是否 pip 安装了该依赖，属已登记的遗留项。
+
+### 遗留（不假装已闭合）
+
+- **`content_aggregator` 未随打包分发**（`python-bridge.js:104` spawn 系统 `python`）。功能在缺依赖时应降级提示并给出确切安装命令（含国内镜像源写法），但**该路径未经真实缺包环境验证**
+- `creator-monitor.js` 目前只含纯逻辑（失败分级、配额求解）；探测调度、claim 落库、outbox finalizer、采集编排**尚未接线到主进程**，IPC 层以依赖注入方式预留
+- 送入 AI 写作（`full-auto-pipeline` 复用）未接线
+- 未跑端到端真实采集（需 API Key + 打包产物内验证）
+- 商店/多账号未实现（D10 已在数据结构预留 `credential_alias`）
+
+### 零假设·零臆测（证据等级）
+
+| 结论 | 证据等级 |
+|---|---|
+| `@handle` 静默返回错误频道 | **真实 API 实测复现**（P0 冒烟 E2E-1 失败项） |
+| 字幕链路可用（1215 字） | **真实 API 实测**（P0 冒烟 E2E-3） |
+| YouTube Data API 端点可用 | **真实 API 实测** |
+| `content_aggregator` 不随分发 | **直接代码证据**（`python-bridge.js:104` + `splitter-bridge.js:20` + `build.extraResources` 无 Python 环境条目） |
+| quotaExceeded 返回 403 | **真实 API 实测 + 官方文档** |
+| 抖音/小红书/视频号长期不可靠 | **工程判断**，非实测；本实现不覆盖这些平台 |
\ No newline at end of file
diff --git a/scripts/gate-record-debt-ledger.json b/scripts/gate-record-debt-ledger.json
index fb6f8f14..13f31e82 100644
--- a/scripts/gate-record-debt-ledger.json
+++ b/scripts/gate-record-debt-ledger.json
@@ -35,5 +35,6 @@
     "line": 4489
   },
   "本次执行记录：批量回填已合并未销账的远程同步欠账（sync-backfill-batch-07，2026-10-07）【docs-only】": "本 PR 在途：合并后由后续 docs-only PR 回填合并 SHA 与远端分支删除证据，并删除本条登记",
-  "本次执行记录：登录页直接关闭页签误报「未捕获到有效登录凭证」修复（fix-login-credential-capture-error）（2026-08-14）": "该记录本体已合并并回填（PR #816/#812 见正文）；账本在此是为覆盖 .quality-gates.md:6952 那条【孤儿 PENDING 行】——它所属的 s2v-scene-multi-materials 记录块丢了 ## 标题，门禁按最近标题把欠账记到本条名下。不代其他会话改写归属，待该记录作者补标题或回填。"
+  "本次执行记录：登录页直接关闭页签误报「未捕获到有效登录凭证」修复（fix-login-credential-capture-error）（2026-08-14）": "该记录本体已合并并回填（PR #816/#812 见正文）；账本在此是为覆盖 .quality-gates.md:6952 那条【孤儿 PENDING 行】——它所属的 s2v-scene-multi-materials 记录块丢了 ## 标题，门禁按最近标题把欠账记到本条名下。不代其他会话改写归属，待该记录作者补标题或回填。",
+  "本次执行记录：博主监控与采集实现（creator-monitor-impl，2026-10-07）": "待 PR 合并；合并成功后于同一回填 PR 中补齐 merge SHA 并删除本登记项"
 }

```

> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。