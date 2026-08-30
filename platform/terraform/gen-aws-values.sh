#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE=terraform-admin
cd "$(dirname "$0")/envs/prod"

OUT=$(terraform output -json)
ACCOUNT_ID=$(echo "$OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ecr_repository_urls']['value']['inventory'].split('/')[0].split('.')[0])")
REGION="ap-south-1"
SQS_URL=$(echo "$OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['sqs_queue_url']['value'])")
BFF_ROLE=$(echo "$OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['booking_bff_irsa_role_arn']['value'])")
WORKER_ROLE=$(echo "$OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['payment_worker_irsa_role_arn']['value'])")
KEDA_ROLE=$(echo "$OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['keda_irsa_role_arn']['value'])")

VALUES_DIR="../../../charts/values"

for svc in inventory booking-bff seatmap payment-worker frontend settlement; do
  REPO_URL=$(echo "$OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ecr_repository_urls']['value']['$svc'])")
  cat > "$VALUES_DIR/values-${svc}-aws.yaml" <<EOF
image:
  repository: "${REPO_URL}"
EOF
done

cat > "$VALUES_DIR/values-booking-bff-aws-irsa.yaml" <<EOF
serviceAccount:
  create: true
  roleArn: "${BFF_ROLE}"
EOF

cat > "$VALUES_DIR/values-payment-worker-aws.yaml" <<EOF
serviceAccount:
  create: true
  roleArn: "${WORKER_ROLE}"
env:
  QUEUE_URL: "${SQS_URL}"
  AWS_REGION: "${REGION}"
keda:
  enabled: true
  authMode: irsa
  queueURL: "${SQS_URL}"
  awsRegion: "${REGION}"
EOF

cat > "$VALUES_DIR/values-booking-bff-aws-queue.yaml" <<EOF
env:
  QUEUE_URL: "${SQS_URL}"
  AWS_REGION: "${REGION}"
EOF

echo "Generated AWS values overlays in $VALUES_DIR:"
ls "$VALUES_DIR" | grep aws
echo
echo "KEDA operator IRSA role (annotate its ServiceAccount when installing KEDA):"
echo "  ${KEDA_ROLE}"
