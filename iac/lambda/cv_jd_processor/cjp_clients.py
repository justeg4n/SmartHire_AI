"""Shared AWS clients — CV/JD processor Lambda."""
import boto3
from botocore.config import Config

retry_config = Config(
    region_name="ap-southeast-1",
    retries={"max_attempts": 10, "mode": "adaptive"},
)

fast_io_config = Config(
    region_name="ap-southeast-1",
    connect_timeout=2,
    read_timeout=5,
    retries={"max_attempts": 1, "mode": "standard"},
)

bedrock = boto3.client("bedrock-runtime", config=retry_config)
textract = boto3.client("textract", region_name="ap-southeast-1")
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
secretsmanager = boto3.client(
    "secretsmanager", region_name="ap-southeast-1", config=fast_io_config
)
