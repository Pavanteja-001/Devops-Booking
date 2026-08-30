# AWS demo day runbook

## 1. Provisioned (done)
- Terraform state backend: S3 `seat-booking-tfstate-402631154447` + DynamoDB `seat-booking-tflock`
- Main infra: VPC, EKS (`seat-booking`, 2x t3.large), 6 ECR repos, SQS `payments`, 5 IRSA roles, GitHub OIDC + CI role

## 2. Point kubectl at EKS
```bash
export AWS_PROFILE=terraform-admin
aws eks update-kubeconfig --name seat-booking --region ap-south-1
kubectl get nodes
```

## 3. Build and push images to ECR
```bash
export AWS_PROFILE=terraform-admin
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com

cd seat-booking-app
for svc in inventory booking-bff seatmap payment-worker settlement frontend; do
  ctx=services/$svc
  [ "$svc" = "frontend" ] && ctx=frontend
  docker build -t <account-id>.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/$svc:v1 $ctx
  docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/$svc:v1
done
```

## 4. Generate AWS values overlays
```bash
./platform/terraform/gen-aws-values.sh
```
This writes `values-<service>-aws.yaml` files with real ECR URLs, SQS URL, and IRSA role ARNs.

## 5. Install platform stack (same as local, on real EKS)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/aws/deploy.yaml
helm install argo-rollouts argo/argo-rollouts -n argo-rollouts --create-namespace
helm install kyverno kyverno/kyverno -n kyverno --create-namespace
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace --set grafana.adminPassword=admin
helm install keda kedacore/keda -n keda --create-namespace \
  --set podIdentity.aws.irsa.enabled=true \
  --set podIdentity.aws.irsa.roleArn=<keda_irsa_role_arn from terraform output>
helm install argocd argo/argo-cd -n argocd --create-namespace
```

## 6. Deploy Postgres/Redis/ElasticMQ→real SQS
- Reuse `platform/manifests/postgres.yaml` and `redis.yaml` as-is (in-cluster, cost-saving choice)
- ElasticMQ is NOT needed on AWS — payment-worker and booking-bff now talk to real SQS via IRSA

## 7. Deploy the app
```bash
kubectl create namespace booking
kubectl apply -f platform/manifests/postgres.yaml -f platform/manifests/redis.yaml
kubectl apply -f platform/networkpolicies/policies.yaml
kubectl apply -f platform/policies/workload-baseline.yaml

for svc in inventory booking-bff seatmap payment-worker frontend; do
  helm upgrade --install $svc platform/charts/seat-service \
    -f platform/charts/values/values-$svc.yaml \
    -f platform/charts/values/values-$svc-aws.yaml \
    -n booking --server-side=false
done
```

## 8. Re-run the 5 demos (already proven locally — just confirming on real infra)
1. Kyverno: `kubectl -n booking run bad-pod --image=nginx:latest --restart=Never`
2. Canary: `helm upgrade booking-bff ... -f values-booking-bff-canary.yaml` → watch `kubectl argo rollouts get rollout booking-bff -n booking`
3. KEDA: send burst to real SQS queue, watch payment-worker scale 0→N→0
4. NetworkPolicy: `kubectl -n booking run netpol-test --image=curlimages/curl ...`
5. Argo CD self-heal: `kubectl -n booking scale deploy/inventory --replicas=0`

## 9. Record the video, then TEAR DOWN IMMEDIATELY
```bash
./platform/terraform/teardown.sh
```
