"""Deterministic skill keys for ranking gap (mirrors job_suggestion_engine fallbacks)."""
from __future__ import annotations

import re

import skill_alias_store as _alias_store
from cr_clients import dynamodb as _dynamodb

_SKILL_VERSION_SUFFIX = re.compile(
    r"(?:\s+|\s*[-/]\s*)(?:v\d+(?:\.\d+)*|ver\.?\s*\d+(?:\.\d+)*|version\s*\d+(?:\.\d+)*)$",
    re.IGNORECASE,
)

# ── SYNC POINT ──────────────────────────────────────────────────────────────
# _DET_ALIASES phải giống nhau trong cả 3 modules:
#   js_skill_canonical_ai.py | cjp_skill_canonical_ai.py | cr_skill_normalize.py
# Khi thêm alias mới, hãy cập nhật CẢ 3 file cùng lúc.
# ─────────────────────────────────────────────────────────────────────────────
_DET_ALIASES: dict[str, str] = {
    "react.js": "React",
    "reactjs": "React",
    "react": "React",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "node": "Node.js",
    "aws lambda": "AWS",
    "lambda": "AWS",
    "k8s": "Kubernetes",
    "tf": "TensorFlow",
    "tensorflow 2": "TensorFlow",
    "pytorch lightning": "PyTorch",
    "torch": "PyTorch",
    "opencv cv": "OpenCV",
    "cv2": "OpenCV",
    "yolo v8": "YOLO",
    "yolov8": "YOLO",
    "yolov5": "YOLO",
    "yolov7": "YOLO",
    "yolo v5": "YOLO",
    "yolo v7": "YOLO",
    "yolov10": "YOLO",
    "yolo v10": "YOLO",
    "faster rcnn": "Faster R-CNN",
    "faster r-cnn": "Faster R-CNN",
    "faster r cnn": "Faster R-CNN",
    "mask r-cnn": "Mask R-CNN",
    "mask rcnn": "Mask R-CNN",
    "u net": "U-Net",
    "unet": "U-Net",
    "u-net": "U-Net",
    "resnet": "ResNet",
    "resnet50": "ResNet",
    "resnet101": "ResNet",
    "resnet-50": "ResNet",
    "resnet-101": "ResNet",
    "efficientnet": "EfficientNet",
    "efficientnet-b0": "EfficientNet",
    "efficientnet-b7": "EfficientNet",
    "vit": "ViT",
    "vision transformer": "ViT",
    "ssd": "SSD",
    "single shot detector": "SSD",
    "sam": "SAM",
    "segment anything": "SAM",
    "cnns": "CNNs",
    "cnn": "CNNs",
    "convolutional neural networks": "CNNs",
    "vision": "Computer Vision",
}

# ── Auto-learning alias store (DynamoDB-backed) ──────────────────────────────
_alias_store.configure(lambda: _dynamodb)
_alias_store.load_aliases(seed=_DET_ALIASES)
# ─────────────────────────────────────────────────────────────────────────────


def _collapse(s: str) -> str:
    return " ".join((s or "").split())


def fold_vendor_cloud_label(label: str) -> str:
    t = _collapse(label)
    if not t:
        return t
    tl = t.casefold()
    if tl == "aws" or tl.startswith("aws ") or tl.startswith("aws("):
        return "AWS"
    if "amazon web services" in tl:
        return "AWS"
    if tl.startswith("gcp ") or tl == "gcp" or tl.startswith("google cloud"):
        return "Google Cloud"
    if tl.startswith("azure ") or tl == "azure":
        return "Azure"
    return t


def _strip_versions_for_key(label: str) -> str:
    base = _collapse(fold_vendor_cloud_label(label))
    base = _SKILL_VERSION_SUFFIX.sub("", base).strip()
    return base


def deterministic_canonical_key(label: str) -> str:
    t = _strip_versions_for_key(label)
    if not t:
        return ""
    k = t.casefold()
    resolved = _alias_store.get_canonical(k) or k
    return resolved.casefold()
