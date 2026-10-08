"""Shared AWS clients — job suggestion Lambda."""
import boto3
from botocore.config import Config

retry_config = Config(
    region_name="ap-southeast-1",
    retries={"max_attempts": 10, "mode": "adaptive"},
)

bedrock = boto3.client("bedrock-runtime", config=retry_config)
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
secretsmanager = boto3.client("secretsmanager", region_name="ap-southeast-1")
