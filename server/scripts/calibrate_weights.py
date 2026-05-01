import argparse
import csv
from dataclasses import dataclass


LABELS = ("go", "caution", "no_go", "hard_no_go")


@dataclass
class Row:
    emotional_intensity: float
    source_transparency: float
    structure_predictability: float
    label: str


def normalize_label(value: str) -> str:
    clean = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "mostly_credible_tone": "go",
        "mixed_signals": "caution",
        "attention_required": "no_go",
        "high_risk": "hard_no_go",
        "hard_no_go": "hard_no_go",
        "no_go": "no_go",
    }
    if clean in LABELS:
        return clean
    if clean in aliases:
        return aliases[clean]
    raise ValueError(f"Unsupported label '{value}'")


def read_dataset(path: str) -> list[Row]:
    rows: list[Row] = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"emotional_intensity", "source_transparency", "structure_predictability", "label"}
        missing = required.difference(set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")

        for idx, item in enumerate(reader, start=2):
            try:
                rows.append(
                    Row(
                        emotional_intensity=float(item["emotional_intensity"]),
                        source_transparency=float(item["source_transparency"]),
                        structure_predictability=float(item["structure_predictability"]),
                        label=normalize_label(item["label"]),
                    )
                )
            except Exception as exc:
                raise ValueError(f"Invalid row {idx}: {exc}") from exc
    return rows


def score_row(row: Row, w_e: float, w_s_inv: float, w_struct: float) -> float:
    risk = (
        row.emotional_intensity * w_e
        + (1.0 - row.source_transparency) * w_s_inv
        + row.structure_predictability * w_struct
    )
    return max(0.0, min(risk, 1.0))


def predict_label(score: float, t_caution: float, t_no_go: float, t_hard: float) -> str:
    if score >= t_hard:
        return "hard_no_go"
    if score >= t_no_go:
        return "no_go"
    if score >= t_caution:
        return "caution"
    return "go"


def f1_macro(y_true: list[str], y_pred: list[str]) -> tuple[float, dict[str, float]]:
    per_class: dict[str, float] = {}
    for label in LABELS:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)

        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        if precision + recall == 0:
            per_class[label] = 0.0
        else:
            per_class[label] = 2 * precision * recall / (precision + recall)

    macro = sum(per_class.values()) / len(LABELS)
    return macro, per_class


def frange(start: float, stop: float, step: float) -> list[float]:
    values: list[float] = []
    current = start
    while current <= stop + 1e-9:
        values.append(round(current, 4))
        current += step
    return values


def search(rows: list[Row], weight_step: float, threshold_step: float) -> dict:
    best = None
    y_true = [row.label for row in rows]

    threshold_values = frange(0.20, 0.90, threshold_step)

    steps = int(round(1.0 / weight_step))
    for i in range(steps + 1):
        for j in range(steps - i + 1):
            k = steps - i - j
            w_e = i * weight_step
            w_s_inv = j * weight_step
            w_struct = k * weight_step
            if w_e + w_s_inv + w_struct == 0:
                continue

            for t_caution in threshold_values:
                for t_no_go in threshold_values:
                    if t_no_go < t_caution:
                        continue
                    for t_hard in threshold_values:
                        if t_hard < t_no_go:
                            continue
                        preds = [
                            predict_label(
                                score_row(row, w_e, w_s_inv, w_struct), t_caution, t_no_go, t_hard
                            )
                            for row in rows
                        ]
                        macro, per_class = f1_macro(y_true, preds)
                        candidate = {
                            "macro_f1": macro,
                            "per_class": per_class,
                            "weights": (w_e, w_s_inv, w_struct),
                            "thresholds": (t_caution, t_no_go, t_hard),
                        }
                        if best is None or candidate["macro_f1"] > best["macro_f1"]:
                            best = candidate
    if best is None:
        raise RuntimeError("Search failed to produce any candidate")
    return best


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate TrustLens analyzer weights and thresholds")
    parser.add_argument("--csv", required=True, help="Path to labeled CSV dataset")
    parser.add_argument("--weight-step", type=float, default=0.05, help="Weight grid step (default: 0.05)")
    parser.add_argument(
        "--threshold-step",
        type=float,
        default=0.05,
        help="Threshold grid step (default: 0.05)",
    )
    args = parser.parse_args()

    rows = read_dataset(args.csv)
    if len(rows) < 20:
        raise ValueError("Dataset too small. Provide at least 20 labeled rows.")

    best = search(rows, args.weight_step, args.threshold_step)
    w_e, w_s_inv, w_struct = best["weights"]
    t_caution, t_no_go, t_hard = best["thresholds"]

    print(f"Rows: {len(rows)}")
    print(f"Best macro F1: {best['macro_f1']:.4f}")
    print("Per-class F1:")
    for label in LABELS:
        print(f"  {label}: {best['per_class'][label]:.4f}")

    print("\nSuggested .env values:")
    print(f"WEIGHT_EMOTIONAL={w_e:.4f}")
    print(f"WEIGHT_SOURCE_INVERSE={w_s_inv:.4f}")
    print(f"WEIGHT_STRUCTURE={w_struct:.4f}")
    print(f"THRESHOLD_CAUTION={t_caution:.4f}")
    print(f"THRESHOLD_NO_GO={t_no_go:.4f}")
    print(f"THRESHOLD_HARD_NO_GO={t_hard:.4f}")


if __name__ == "__main__":
    main()
