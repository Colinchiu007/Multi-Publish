class ClipSearch(BaseTool):
    name = "clip_search"
    tier = ToolTier.ANALYZE
    capability = "clip_retrieval"
    provider = "openmontage"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = [


    resource_profile = ResourceProfile(

    def get_status(self) -> ToolStatus:
        try:
            import numpy  # noqa: F401
            import torch  # noqa: F401
            import transformers  # noqa: F401
        except ImportError:
            return ToolStatus.UNAVAILABLE
        return ToolStatus.AVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    # ------------------------------------------------------------------
    # Execute
    # ------------------------------------------------------------------

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        start = time.time()
        try:
            from lib.corpus import Corpus

            operation = inputs["operation"]
            corpus_dir = Path(inputs["corpus_dir"])

            corp = Corpus(corpus_dir)
            corp.load()

            if operation == "stats":
                payload = _op_stats(corp)
            elif operation == "rank_for_slot":
                payload = _op_rank_for_slot(corp, inputs)
            elif operation == "find_similar_set":
                payload = _op_find_similar_set(corp, inputs)
            elif operation == "diversify":
                payload = _op_diversify(corp, inputs)
            elif operation == "get":
                payload = _op_get(corp, inputs)
            else:
                return ToolResult(
                    success=False,
                    error=f"Unknown operation: {operation!r}",
                )

            return ToolResult(
                success=True,
                data={
                    "operation": operation,
                    "corpus_dir": str(corpus_dir),
                    "corpus_size": len(corp),
                    **payload,
                },
                duration_seconds=round(time.time() - start, 3),
                cost_usd=0.0,
            )
        except Exception as e:
            import traceback
            return ToolResult(
                success=False,
                error=f"{type(e).__name__}: {e}\n{traceback.format_exc()[-800:]}",
            )

# ----------------------------------------------------------------------
# Operations
# ----------------------------------------------------------------------

def _op_stats(corp) -> dict[str, Any]:
    """Summary counts and per-source breakdown.

    Useful as a sanity check before running expensive retrieval loops —
    "does the corpus I loaded actually have enough clips to satisfy the
    edit plan?"
    """
    import numpy as np

    if len(corp) == 0:
        return {
            "rows": 0,
            "per_source": {},
            "per_kind": {},
            "mean_motion_score": 0.0,
            "mean_duration": 0.0,
        }

    per_source: dict[str, int] = {}
    per_kind: dict[str, int] = {}
    motion_scores: list[float] = []
    durations: list[float] = []
    for rec in corp.records:
        per_source[rec.source] = per_source.get(rec.source, 0) + 1
        per_kind[rec.kind] = per_kind.get(rec.kind, 0) + 1
        motion_scores.append(rec.motion_score)
        durations.append(rec.duration)

    return {
        "rows": len(corp),
        "per_source": per_source,
        "per_kind": per_kind,
        "mean_motion_score": float(np.mean(motion_scores)) if motion_scores else 0.0,
        "mean_duration": float(np.mean(durations)) if durations else 0.0,
    }

def _op_rank_for_slot(corp, inputs: dict[str, Any]) -> dict[str, Any]:
    """Embed `query_text` and return top-k clips by fused similarity.

    This is the agent's main retrieval move. The returned list is
    ordered best-first and every entry carries a score so the agent
    can decide whether the match is strong enough (>= 0.25 is a rough
    "acceptable" threshold for CLIP ViT-B/32).
    """
    from lib.clip_embedder import embed_texts

    query_text = inputs.get("query_text", "").strip()
    if not query_text:
        raise ValueError("rank_for_slot requires 'query_text'")

    q_vec = embed_texts([query_text])[0]

    results = corp.rank_by_text(
        query_embedding=q_vec,
        k=int(inputs.get("k", 10)),
        tag_weight=float(inputs.get("tag_weight", 0.3)),
        motion_min=inputs.get("motion_min"),
        kind=inputs.get("kind"),
        exclude_ids=inputs.get("exclude_ids") or [],
    )
    return {
        "query_text": query_text,
        "results": [
            {"score": score, "record": asdict(rec)}
            for rec, score in results
    }

def _op_find_similar_set(corp, inputs: dict[str, Any]) -> dict[str, Any]:
    """MMR-based similar-set retrieval from one seed clip."""
    seed = inputs.get("seed_clip_id")
    if not seed:
        raise ValueError("find_similar_set requires 'seed_clip_id'")

    results = corp.find_similar_set(
        seed_clip_id=seed,
        n=int(inputs.get("n", 5)),
        diversity=float(inputs.get("diversity", 0.3)),
        candidate_pool=int(inputs.get("candidate_pool", 30)),
        exclude_ids=inputs.get("exclude_ids") or [],
    )
    return {
        "seed_clip_id": seed,
        "results": [
            {"score": score, "record": asdict(rec)}
            for rec, score in results
    }

def _op_diversify(corp, inputs: dict[str, Any]) -> dict[str, Any]:
    """Pick the most mutually-dissimilar subset of a candidate list."""
    candidate_ids = inputs.get("candidate_ids") or []
    if not candidate_ids:
        raise ValueError("diversify requires 'candidate_ids'")

    kept = corp.diversify(
        candidate_ids=list(candidate_ids),
        n=int(inputs.get("n", 5)),
        diversity=float(inputs.get("diversity", 0.5)),
    )
    return {
        "input_count": len(candidate_ids),
        "kept_count": len(kept),
        "kept_ids": kept,
    }

def _op_get(corp, inputs: dict[str, Any]) -> dict[str, Any]:
    """Look up one clip_id and return its full record."""
    clip_id = inputs.get("clip_id")
    if not clip_id:
        raise ValueError("get requires 'clip_id'")

    rec = corp.get(clip_id)
    if rec is None:
        return {"clip_id": clip_id, "found": False, "record": None}
    return {"clip_id": clip_id, "found": True, "record": asdict(rec)}
