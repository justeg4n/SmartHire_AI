"""
Purge all SKILL_ALIAS items from DynamoDB.

This deletes every item with PK = "SKILL_ALIAS" (all auto-learned aliases).
After running this, Haiku will resolve every skill match fresh without any
cached aliases polluting the table.

Usage:
    python purge_skill_aliases.py --dry-run
    python purge_skill_aliases.py --table SmartHire_ApplicationTracking --region ap-southeast-1
"""
import argparse
import boto3


def purge(table_name: str, region: str, dry_run: bool) -> None:
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    # Query all SKILL_ALIAS items (single partition key — no Scan needed)
    items = []
    kwargs = {
        "KeyConditionExpression": "PK = :pk",
        "ExpressionAttributeValues": {":pk": "SKILL_ALIAS"},
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last

    if not items:
        print("No SKILL_ALIAS items found — table is already clean.")
        return

    print(f"Found {len(items)} SKILL_ALIAS items.")

    if dry_run:
        print("[DRY RUN] Would delete:")
        for item in items:
            print(f"  PK={item['PK']}  SK={item['SK']}  canonical={item.get('canonical', '')}  source={item.get('source', '')}  hitCount={item.get('hitCount', 0)}")
        print(f"[DRY RUN] Total: {len(items)} items — nothing deleted.")
        return

    # Batch delete (DynamoDB batch_writer handles 25-item batches automatically)
    deleted = 0
    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            deleted += 1

    print(f"Deleted {deleted} SKILL_ALIAS items from '{table_name}'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge all SKILL_ALIAS items from DynamoDB.")
    parser.add_argument("--table", default="SmartHire_ApplicationTracking", help="DynamoDB table name")
    parser.add_argument("--region", default="ap-southeast-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Print items that would be deleted without deleting")
    args = parser.parse_args()

    purge(args.table, args.region, args.dry_run)
