"""
One-time migration: seed the hardcoded _DET_ALIASES into DynamoDB as SKILL_ALIAS items.

After running this script, DynamoDB becomes the single source of truth for aliases.
The _DET_ALIASES dicts in the Lambda source files remain as compile-time fallback only.

Usage:
    python seed_skill_aliases.py [--dry-run]
    python seed_skill_aliases.py --table SmartHire_ApplicationTracking --region ap-southeast-1
"""
from __future__ import annotations

import argparse
import datetime
from decimal import Decimal

import boto3

# The canonical hardcoded alias dict (keep in sync with _DET_ALIASES in the Lambda files)
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


def seed(table_name: str, region: str, dry_run: bool = False) -> None:
    now_iso = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    if dry_run:
        print(f"[dry-run] Would write {len(_DET_ALIASES)} aliases to {table_name} ({region}):\n")
        for alias_key, canonical in sorted(_DET_ALIASES.items()):
            print(f"  ALIAS#{alias_key:<40} -> {canonical}")
        print(f"\n[dry-run] Total: {len(_DET_ALIASES)} items. Remove --dry-run to execute.")
        return

    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    with table.batch_writer() as batch:
        for alias_key, canonical in _DET_ALIASES.items():
            item = {
                "PK":        "SKILL_ALIAS",
                "SK":        f"ALIAS#{alias_key}",
                "canonical": canonical,
                "source":    "seed",
                "confidence": Decimal("1"),
                "hitCount":  Decimal("0"),
                "createdAt": now_iso,
                "updatedAt": now_iso,
            }
            batch.put_item(Item=item)
            print(f"  written: ALIAS#{alias_key:<40} -> {canonical}")

    print(f"\nSeeded {len(_DET_ALIASES)} aliases into {table_name} ({region}).")
    print("DynamoDB is now the primary source of truth for skill aliases.")
    print("The Lambda _DET_ALIASES dicts remain as compile-time fallback.")


def list_aliases(table_name: str, region: str) -> None:
    """Query and display all current SKILL_ALIAS items in the table."""
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    kwargs: dict = {
        "KeyConditionExpression": "PK = :pk",
        "ExpressionAttributeValues": {":pk": "SKILL_ALIAS"},
    }
    items = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    print(f"Found {len(items)} SKILL_ALIAS items in {table_name}:\n")
    seed_count = sum(1 for i in items if i.get("source") == "seed")
    haiku_count = sum(1 for i in items if i.get("source") == "haiku")
    manual_count = sum(1 for i in items if i.get("source") == "manual")

    items.sort(key=lambda i: str(i.get("SK", "")))
    for item in items:
        sk = str(item.get("SK", "")).removeprefix("ALIAS#")
        canonical = item.get("canonical", "")
        source = item.get("source", "?")
        hits = item.get("hitCount", 0)
        conf = item.get("confidence", "?")
        print(f"  {sk:<40} -> {canonical:<30} [{source}, hits={hits}, conf={conf}]")

    print(f"\nSummary: {seed_count} seed, {haiku_count} haiku-learned, {manual_count} manual")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed or inspect SKILL_ALIAS items in DynamoDB.")
    parser.add_argument("--table", default="SmartHire_ApplicationTracking", help="DynamoDB table name")
    parser.add_argument("--region", default="ap-southeast-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--list", action="store_true", help="List current aliases in DynamoDB")
    args = parser.parse_args()

    if args.list:
        list_aliases(args.table, args.region)
    else:
        seed(args.table, args.region, dry_run=args.dry_run)
