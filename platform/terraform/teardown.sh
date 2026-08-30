#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE=terraform-admin
cd "$(dirname "$0")/envs/prod"

echo "=== Step 1: deleting Kubernetes-created AWS resources (LoadBalancers, PVCs) ==="
kubectl delete svc --all-namespaces --field-selector spec.type=LoadBalancer --ignore-not-found=true || true
kubectl delete pvc --all --all-namespaces --ignore-not-found=true || true
kubectl delete ingress --all --all-namespaces --ignore-not-found=true || true

echo "=== Step 2: waiting 30s for AWS to actually remove them ==="
sleep 30

echo "=== Step 3: checking for leftover ELBs/EBS volumes ==="
aws elbv2 describe-load-balancers --profile terraform-admin --query 'LoadBalancers[].LoadBalancerName' 2>&1 || true
aws ec2 describe-volumes --profile terraform-admin --filters Name=status,Values=available --query 'Volumes[].VolumeId' 2>&1 || true

echo "=== Step 4: terraform destroy (main env) ==="
terraform destroy -auto-approve

echo "=== Step 5: confirm nothing left in the VPC ==="
VPC_ID=$(terraform output -raw vpc_id 2>/dev/null || echo "")
if [ -n "$VPC_ID" ]; then
  aws ec2 describe-network-interfaces --profile terraform-admin --filters "Name=vpc-id,Values=$VPC_ID" 2>&1 || true
fi

echo "=== Done. Bootstrap state bucket/DynamoDB table are left in place (pennies/month) unless you also want those gone. ==="
echo "To remove those too: cd ../bootstrap && terraform destroy -auto-approve"
