import json
import os
import time

import boto3
import requests
from prometheus_client import Counter, start_http_server

QUEUE_URL = os.environ.get("QUEUE_URL", "http://localhost:9324/queue/payments")
BFF_URL = os.environ.get("BFF_URL", "http://localhost:8080")
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "internal-devsecret")
GATEWAY_DELAY_SECONDS = float(os.environ.get("GATEWAY_DELAY_SECONDS", "3"))

PAYMENTS_PROCESSED = Counter("payments_processed_total", "Payments processed", ["status"])

sqs = boto3.client(
    "sqs",
    region_name=os.environ.get("AWS_REGION", "elasticmq"),
    endpoint_url=os.environ.get("QUEUE_ENDPOINT", "http://localhost:9324"),
    aws_access_key_id="local",
    aws_secret_access_key="local",
)


def complete_booking(booking_id):
    resp = requests.post(
        f"{BFF_URL}/internal/bookings/{booking_id}/complete",
        headers={"X-Internal-Token": INTERNAL_TOKEN},
        timeout=5,
    )
    resp.raise_for_status()


def process_message(message):
    body = json.loads(message["Body"])
    print(f"processing payment for booking {body['bookingId']}", flush=True)
    time.sleep(GATEWAY_DELAY_SECONDS)
    complete_booking(body["bookingId"])
    print(f"booking {body['bookingId']} confirmed", flush=True)


def main():
    start_http_server(8080)
    print("payment-worker started, polling", QUEUE_URL, flush=True)
    while True:
        resp = sqs.receive_message(QueueUrl=QUEUE_URL, MaxNumberOfMessages=5, WaitTimeSeconds=10)
        for message in resp.get("Messages", []):
            try:
                process_message(message)
                sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=message["ReceiptHandle"])
                PAYMENTS_PROCESSED.labels("success").inc()
            except Exception as e:
                print(f"payment failed: {e}", flush=True)
                PAYMENTS_PROCESSED.labels("failure").inc()


if __name__ == "__main__":
    main()
